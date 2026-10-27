import {Module} from '@nestjs/common';

import {AppController} from './app.controller';
import {AppService} from './app.service';

import {MongooseModule} from '@nestjs/mongoose';
import {ConfigModule} from '@nestjs/config';
import {NotificationModule} from './notification/notification.module';
import {BookingsModule} from './bookings/bookings.module';
import {UsersModule} from './users/users.module';
import {JwtModule} from '@nestjs/jwt';
import {ClientModule} from './clients/client.module';
import {BuildingModule} from './buildings/building.module';
import {PassportModule} from '@nestjs/passport';
import {AuthorizationModule} from './authorization/authorization.module';
import {validateEnv} from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate: validateEnv
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: {expiresIn: '1d'}
    }),
    PassportModule.register({session: false}),
    MongooseModule.forRoot(process.env.DB_URI, {dbName: 'book_space'}),
    AuthorizationModule,
    BookingsModule,
    NotificationModule,
    UsersModule,
    ClientModule,
    BuildingModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
