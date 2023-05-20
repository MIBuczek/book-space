import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { AuthorizationService } from '../../service/auth/authorization.service';
import { LoginUserDto } from '@server/users/models/login-user-dto';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthorizationController {
  constructor(
    private autService: AuthorizationService,
    private jwtService: JwtService
  ) {}

  /**
   * Sing in user controller method.
   */
  @Post('sign-in')
  async signIn(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const loginUserDto: LoginUserDto = req.body;
    const response = await this.autService.signIn(loginUserDto);
    if (response['_id']) {
      const payload = { username: response.firstName, sub: response['_id'] };
      const token = await this.jwtService.signAsync(payload);
      res.cookie('jwt', { token }, { httpOnly: true, maxAge: 259200 * 1000 });
      res.status(201).json({ user: response });
    } else {
      res.cookie('jwt', '', { httpOnly: true, expires: new Date() });
      res.status(400).json({ errors: response });
    }
  }

  @Get('sign-out')
  async signOut(@Res({ passthrough: true }) res: Response) {
    res.cookie('jwt', '', { httpOnly: true, expires: new Date() });
  }
}
