import {Module} from '@nestjs/common';
import {BookingController} from './controller/booking.controller';
import {BookingService} from './service/booking.service';
import {BookingSchema} from './schemas/booking.schema';
import {MongooseModule} from '@nestjs/mongoose';
import {JwtStrategy} from '@server/strategy/jwt.strategy';
import {AuthorizationModule} from '@server/auth/authorization.module';

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([{name: 'Booking', schema: BookingSchema}])
  ],
  controllers: [BookingController],
  providers: [JwtStrategy, BookingService]
})
export class BookingsModule {}
