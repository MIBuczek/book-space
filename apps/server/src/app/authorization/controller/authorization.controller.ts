import {Body, Controller, Get, Post, Res} from '@nestjs/common';
import {AuthorizationService} from '../service/authorization.service';
import {LoginUserDto} from '../models/login-user-dto';
import {Response} from 'express';
import {JwtService} from '@nestjs/jwt';
import {serializeUser} from '../../users/models/user.serializer';

@Controller('auth')
export class AuthorizationController {
  constructor(private autService: AuthorizationService, private jwtService: JwtService) {}

  /**
   * Sign in user controller method.
   */
  @Post('sign-in')
  async signIn(@Body() loginUserDto: LoginUserDto) {
    const user = await this.autService.signIn(loginUserDto);
    const payload = {email: user.email, _id: user._id};
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
