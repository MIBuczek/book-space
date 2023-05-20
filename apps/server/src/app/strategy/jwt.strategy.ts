import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromExtractors([
          (req: Request) => {
            let jwt = req.cookies['jwt'];
            if (!jwt) return null;
            return jwt['token'];
          },
        ]),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }
  async validate(payload: unknown) {
    if (payload === null) throw new UnauthorizedException();
    return payload;
  }
}
