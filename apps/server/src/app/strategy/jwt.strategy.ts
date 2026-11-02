import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy, VerifiedCallback} from 'passport-jwt';
import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {JwtPayload} from '@models/jwt-payload.model';
import {AuthorizationService} from '../authorization/service/authorization.service';

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
    // `await` matters: passing the promise to `done` would set `request.user` to a
    // Promise, so `RolesGuard` would read `user.role` off it and find nothing —
    // refusing every role-restricted route for every caller.
    const user = await this.authService.validateUser(payload);
    return done(null, user, payload.iat);
  }
}
