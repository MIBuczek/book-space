import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import bcrypt from 'bcrypt';
import {LoginUserDto} from '../models/login-user-dto';
import {TUser} from '../../users/schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {handleAuthErrors} from '../../utility/validation-error.fun';
import {JwtPayload} from '@models/jwt-payload.model';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel('User') private userModel: Model<TUser>,
    private readonly logger: StructuredLogger
  ) {}

  /**
   *
   * @param loginUserDto
   */
  async signIn(loginUserDto: LoginUserDto): Promise<TUser> {
    try {
      const {email, password} = loginUserDto;

      const currentUser = await this.userModel.findOne({email});

      if (!currentUser) {
        // The attempted address is not logged: it is personal data, and the
        // caller already knows what they typed.
        this.logger.warn('auth.sign_in.rejected', {reason: 'unknown_email'});
        throw new HttpException('Incorrect email', HttpStatus.UNAUTHORIZED);
      }

      const pass_auth = await bcrypt.compare(password, currentUser.password);

      if (!pass_auth) {
        this.logger.warn('auth.sign_in.rejected', {reason: 'bad_password', userId: currentUser._id});
        throw new HttpException('Incorrect password', HttpStatus.UNAUTHORIZED);
      }

      currentUser.lastLogin = new Date();

      await this.userModel.updateOne({_id: currentUser._id}, {lastLogin: currentUser.lastLogin});

      this.logger.log('auth.sign_in.succeeded', {userId: currentUser._id});

      return currentUser;
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Validate user by given JWT token.
   *
   * @param {JwtPayload} payload
   */
  async validateUser(payload: JwtPayload) {
    try {
      const {_id, email} = payload;
      const user = await this.userModel.findOne({_id});
      if (!user || user.email !== email) {
        this.logger.warn('auth.token.rejected', {userId: _id});
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }
      return user;
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
