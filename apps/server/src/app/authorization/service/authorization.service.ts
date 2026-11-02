import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import bcrypt from 'bcrypt';
import {LoginUserDto} from '../models/login-user-dto';
import {TUser} from '../../users/schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {JwtPayload} from '@models/jwt-payload.model';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';

/**
 * The only message any sign-in rejection carries. It deliberately does not say which
 * field was wrong: "unknown e-mail" and "wrong password" are the same answer, so the
 * endpoint cannot be used to discover which addresses have accounts.
 */
const INVALID_CREDENTIALS = 'Invalid e-mail or password';

/**
 * A real bcrypt hash of a value nobody can supply, compared against when the account
 * is unknown so that the unknown-address path costs the same as the wrong-password
 * path. Without it, a missing account returns before the comparison and the response
 * time leaks the answer the message no longer gives.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$r86gAFEIzefzmkWEDEd7eegIVdbAY2xbwCY2UfntDfxUl9Ym7nvDq';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel('User') private userModel: Model<TUser>,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Authenticates by e-mail and password.
   *
   * Every rejection answers the same way. The three failure modes — unknown address,
   * wrong password, deactivated account — must be indistinguishable to the caller, or
   * the endpoint becomes an oracle for which addresses have accounts. The reason is
   * still logged, so an operator can tell them apart; only the response is uniform.
   *
   * The password comparison runs even when the account is unknown, against a dummy
   * hash. Returning early would make the unknown-address path measurably faster, and
   * the timing difference is itself an enumeration oracle.
   */
  async signIn(loginUserDto: LoginUserDto): Promise<TUser> {
    const {email, password} = loginUserDto;

    try {
      const currentUser = await this.userModel.findOne({email});

      if (!currentUser) {
        // The attempted address is not logged: it is personal data, and the caller
        // already knows what they typed.
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        this.logger.warn('auth.sign_in.rejected', {reason: 'unknown_email'});
        throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
      }

      const pass_auth = await bcrypt.compare(password, currentUser.password);

      if (!pass_auth) {
        this.logger.warn('auth.sign_in.rejected', {reason: 'bad_password', userId: currentUser._id});
        throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
      }

      // Checked after the password, so a caller who does not already know the
      // password cannot use this path to learn that the account exists. `=== false`
      // treats a legacy document with no `active` field as active, matching the
      // schema default.
      if (currentUser.active === false) {
        this.logger.warn('auth.sign_in.rejected', {reason: 'inactive_user', userId: currentUser._id});
        throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
      }

      currentUser.lastLogin = new Date();

      await this.userModel.updateOne({_id: currentUser._id}, {lastLogin: currentUser.lastLogin});

      this.logger.log('auth.sign_in.succeeded', {userId: currentUser._id});

      return currentUser;
    } catch (e) {
      // The message is taken from the exception this method raised rather than
      // re-mapped by field. `handleAuthErrors` turned "Incorrect email" and
      // "Incorrect password" into distinct sentences, which is how the response
      // leaked whether an address was registered even after the service stopped
      // saying so.
      if (e instanceof HttpException) {
        throw e;
      }
      this.logger.error('auth.sign_in.failed', {reason: errorMessage(e)});
      throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Resolves the acting user from a verified JWT payload.
   *
   * The token carries an e-mail and an id; both must still match the stored account,
   * so a renamed or recreated user cannot keep using an old token. The rejection is
   * `401` with a message that does not distinguish "no such user" from "the e-mail
   * changed", for the same reason sign-in does not.
   */
  async validateUser(payload: JwtPayload) {
    try {
      const {_id, email} = payload;
      const user = await this.userModel.findOne({_id});
      if (!user || user.email !== email) {
        this.logger.warn('auth.token.rejected', {userId: _id});
        throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
      }
      // Deactivation has to be checked here too, not only at sign-in. A token is
      // valid for a day, so an account disabled after its token was issued would
      // keep working for the rest of that day if this path trusted the signature
      // alone. `=== false` rather than a falsy test: a legacy document with no
      // `active` field is active, matching the schema default.
      if (user.active === false) {
        this.logger.warn('auth.token.rejected', {reason: 'inactive_user', userId: _id});
        throw new HttpException(INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
      }
      return user;
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
