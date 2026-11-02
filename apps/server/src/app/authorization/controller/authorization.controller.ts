import {Body, Controller, Get, Post, Res, UseGuards} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {AuthorizationService} from '../service/authorization.service';
import {LoginUserDto} from '../models/login-user-dto';
import {Response} from 'express';
import {JwtService} from '@nestjs/jwt';
import {serializeUser} from '../../users/models/user.serializer';
import {JwtPayload} from '@models/jwt-payload.model';
import {CurrentUser} from '../decorators/current-user.decorator';
import {IActingUser} from '../ownership';

@Controller('auth')
export class AuthorizationController {
  constructor(private autService: AuthorizationService, private jwtService: JwtService) {}

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
    return {user: serializeUser(user), token};
  }

  /**
   * Returns the authenticated user with the role and assignments resolved from the
   * database.
   *
   * `JwtStrategy.validate` has already loaded the account, so the user on the request
   * is the stored document and not a re-issued token's claims. That matters for
   * `role`, `city` and `buildings`: a response built from the token would report the
   * values as they were when the token was minted, so an administrator's change to an
   * account would not appear until the token expired.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@CurrentUser() user: IActingUser) {
    return serializeUser(user);
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
