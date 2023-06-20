import {Module} from '@nestjs/common';
import {PassportModule} from '@nestjs/passport';
import {MongooseModule} from '@nestjs/mongoose';
import {UserSchema} from '@server/users/schemas/user.schema';
import {JwtStrategy} from '@server/strategy/jwt.strategy';
import {AuthorizationService} from './service/authorization.service';
import {AuthorizationController} from './controller/authorization.controller';

@Module({
  imports: [
    PassportModule.register({session: false}),
    MongooseModule.forFeature([{name: 'User', schema: UserSchema}])
  ],
  providers: [JwtStrategy, AuthorizationService],
  controllers: [AuthorizationController],
  exports: [AuthorizationService]
})
export class AuthorizationModule {}
