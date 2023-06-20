import {Module} from '@nestjs/common';

import {MongooseModule} from '@nestjs/mongoose';
import {UserSchema} from './schemas/user.schema';
import {JwtStrategy} from '@server/strategy/jwt.strategy';
import {UsersController} from '@server/users/controller/users.controller';
import {UserService} from '@server/users/service/user.service';
import {AuthorizationModule} from '@server/auth/authorization.module';

@Module({
  imports: [AuthorizationModule, MongooseModule.forFeature([{name: 'User', schema: UserSchema}])],
  providers: [JwtStrategy, UserService],
  controllers: [UsersController]
})
export class UsersModule {}
