import {Module} from '@nestjs/common';

import {MongooseModule} from '@nestjs/mongoose';
import {UserSchema} from './schemas/user.schema';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {UsersController} from './controller/users.controller';
import {UserService} from './service/user.service';
import {AuthorizationModule} from '../authorization/authorization.module';

@Module({
  imports: [AuthorizationModule, MongooseModule.forFeature([{name: 'User', schema: UserSchema}])],
  providers: [JwtStrategy, UserService],
  controllers: [UsersController]
})
export class UsersModule {}
