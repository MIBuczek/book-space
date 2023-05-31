import {Body, Controller, Get, Post, Req, Res, ValidationPipe} from '@nestjs/common';
import {AuthorizationService} from '../service/authorization.service';
import {LoginUserDto} from '../models/login-user-dto';
import {Response} from 'express';
import {JwtService} from '@nestjs/jwt';

@Controller('auth')
export class AuthorizationController {
  constructor(private autService: AuthorizationService, private jwtService: JwtService) {}

  /**
   * Sing in user controller method.
   */
  @Post('sign-in')
  async signIn(@Body(new ValidationPipe()) loginUserDto: LoginUserDto) {
    const user = await this.autService.signIn(loginUserDto);
    const payload = {userEmail: user.email, _id: user['_id']};
    const token = await this.jwtService.signAsync(payload);
    return {user, token};
  }

  @Get('sign-out')
  async signOut(@Res({passthrough: true}) res: Response) {
    res.cookie('jwt', '', {httpOnly: true, expires: new Date()});
  }
}
