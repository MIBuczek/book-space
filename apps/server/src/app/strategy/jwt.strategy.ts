import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy, VerifiedCallback} from 'passport-jwt';
import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {JwtPayload} from '@models/jwt-payload.model';
import {AuthorizationService} from '@server/auth/service/authorization.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthorizationService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET
    });
  }
  async validate(payload: JwtPayload | null, done: VerifiedCallback) {
    if (payload === null) return done(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED));
    const user = this.authService.validateUser(payload);
    return done(null, user, payload.iat);
  }
}
