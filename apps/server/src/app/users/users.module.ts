import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { JwtStrategy } from '@server/strategy/jwt.strategy';
import { UserService } from './service/user/user.service';
import { AuthorizationService } from '@server/users/service/auth/authorization.service';
import { AuthorizationController } from '@server/users/controller/auth/authorization.controller';
import { UsersController } from '@server/users/controller/users/users.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
    PassportModule.register({ session: false }),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  providers: [JwtStrategy, AuthorizationService, UserService],
  controllers: [AuthorizationController, UsersController],
})
export class UsersModule {}
