import {Module} from '@nestjs/common';
import {BookingController} from './controller/booking.controller';
import {BookingService} from './service/booking.service';
import {BookingSchema} from './schemas/booking.schema';
import {BuildingSchema} from '../buildings/schemas/building.schema';
import {MongooseModule} from '@nestjs/mongoose';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([
      {name: 'Booking', schema: BookingSchema},
      // The size rule (T052) reads the facility's allowed sizes on write, so the bookings
      // module needs the Building model rather than reaching into the buildings module.
      {name: 'Building', schema: BuildingSchema},
    ])
  ],
  controllers: [BookingController],
  providers: [JwtStrategy, BookingService]
})
export class BookingsModule {}
