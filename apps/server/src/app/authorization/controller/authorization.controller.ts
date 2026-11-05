import {Body, Controller, Get, Post, Res, UseGuards} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {ConfigService} from '@nestjs/config';
import {AuthorizationService} from '../service/authorization.service';
import {LoginUserDto} from '../models/login-user-dto';
import {Response} from 'express';
import {JwtService} from '@nestjs/jwt';
import {serializeUser} from '../../users/models/user.serializer';
import {JwtPayload} from '@models/jwt-payload.model';
import {CurrentUser} from '../decorators/current-user.decorator';
import {IActingUser} from '../ownership';
import {capabilitiesFor} from '../capabilities';
import {isSummaryDenied, parseDenyList} from '../../reporting/deny-list';
import {IUserCapabilities} from '@models/user.model';

@Controller('auth')
export class AuthorizationController {
  constructor(
    private autService: AuthorizationService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  /**
   * Resolves the capability matrix for a user (FR-004, FR-006).
   *
   * The Summary deny-list is read per request, not captured at construction, so an
   * operator can change `SUMMARY_DENY_LIST` without a redeploy — the same reason the
   * reporting controller reads it on each call. A role the matrix does not recognise
   * cannot reach here: the schema enum rejects it, and `JwtStrategy` loads the stored
   * document.
   */
  private capabilitiesOf(user: {role: string; email?: string}): IUserCapabilities {
    const denyList = parseDenyList(this.configService.get<string>('SUMMARY_DENY_LIST'));
    return capabilitiesFor(user.role as never, isSummaryDenied(user.email, denyList));
  }

  /**
   * Sign in user controller method.
   */
  @Post('sign-in')
  async signIn(@Body() loginUserDto: LoginUserDto) {
    const user = await this.autService.signIn(loginUserDto);
    // The role comes from the stored user, never from the request body. A role taken
    // from the caller would let anyone mint a token for a role they do not hold, and
    // `RolesGuard` trusts the token — so the stored value is the only safe source.
    //
    // `_id` is an `ObjectId`; `JwtPayload` declares it a string. The conversion is
    // explicit because it was previously implicit: JSON serialisation turned the
    // ObjectId into its hex string anyway, so the token was already a string and
    // only the type was wrong.
    const payload: JwtPayload = {email: user.email, _id: String(user._id), role: user.role};
    const token = await this.jwtService.signAsync(payload);
    // `user` is the stored document, which carries the bcrypt hash. Serialising
    // here is what stops the hash reaching the client — the service needs it to
    // compare against, so it cannot be stripped any earlier.
    return {user: {...serializeUser(user), capabilities: this.capabilitiesOf(user)}, token};
  }

  /**
   * Returns the authenticated user with the role, assignments and capabilities resolved
   * from the database.
   *
   * `JwtStrategy.validate` has already loaded the account, so the user on the request
   * is the stored document and not a re-issued token's claims. That matters for
   * `role`, `city` and `buildings`: a response built from the token would report the
   * values as they were when the token was minted, so an administrator's change to an
   * account would not appear until the token expired. The capabilities are computed from
   * that same stored document, so a role or deny-list change takes effect on the next
   * request too.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@CurrentUser() user: IActingUser) {
    // Cast to the nullable overload: the guard should have refused first, so a missing
    // user is unreachable in production, but `serializeUser` is defined to answer `null`
    // for one and a throw here would turn a guard misconfiguration into a 500.
    const serialized = serializeUser(user as object | null | undefined);
    if (!serialized) {
      return null;
    }
    return {
      ...serialized,
      capabilities: this.capabilitiesOf(user as {role: string; email?: string}),
    };
  }

  /**
   * Sign-out is stateless: it clears the cookie and returns, and the token stays
   * valid until it expires. There is no server-side session to destroy
   * (contracts/authorization-matrix.md), so a caller cannot rely on this to revoke a
   * token — that is what the token expiry is for.
   */
  @Get('sign-out')
  async signOut(@Res({passthrough: true}) res: Response) {
    res.cookie('jwt', '', {httpOnly: true, expires: new Date()});
    return {message: 'Signed out'};
  }
}
