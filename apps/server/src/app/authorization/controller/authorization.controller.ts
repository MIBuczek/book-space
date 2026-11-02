import {Body, Controller, Get, Post, Res} from '@nestjs/common';
import {AuthorizationService} from '../service/authorization.service';
import {LoginUserDto} from '../models/login-user-dto';
import {Response} from 'express';
import {JwtService} from '@nestjs/jwt';
import {serializeUser} from '../../users/models/user.serializer';
import {JwtPayload} from '@models/jwt-payload.model';

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

  @Get('sign-out')
  async signOut(@Res({passthrough: true}) res: Response) {
    res.cookie('jwt', '', {httpOnly: true, expires: new Date()});
  }
}
