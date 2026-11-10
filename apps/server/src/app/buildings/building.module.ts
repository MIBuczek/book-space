import {Module} from '@nestjs/common';
import {BuildingService} from './service/building.service';
import {BuildingController} from './controller/building.controller';
import {MongooseModule} from '@nestjs/mongoose';
import {BuildingSchema} from './schemas/building.schema';
import {BookingSchema} from '../bookings/schemas/booking.schema';
import {UserSchema} from '../users/schemas/user.schema';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';
import {ReferenceDataService} from './seed/reference-data.service';

@Module({
  imports: [
    AuthorizationModule,
    // `Booking` and `User` are registered here so `BuildingService.deleteBuilding` can
    // refuse a facility that a booking or a staff assignment still references (T059),
    // without reaching into the bookings or users modules.
    MongooseModule.forFeature([
      {name: 'Building', schema: BuildingSchema},
      {name: 'Booking', schema: BookingSchema},
      {name: 'User', schema: UserSchema}
    ])
  ],
  controllers: [BuildingController],
  providers: [JwtStrategy, BuildingService, ReferenceDataService]
})
export class BuildingModule {}
