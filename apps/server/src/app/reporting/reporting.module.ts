import {Module} from '@nestjs/common';
import {MongooseModule} from '@nestjs/mongoose';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';
import {BookingSchema} from '../bookings/schemas/booking.schema';
import {ClientSchema} from '../clients/schemas/client.schema';
import {ReportingService} from './service/reporting.service';
import {ReportingController} from './controller/reporting.controller';

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([
      {name: 'Booking', schema: BookingSchema},
      {name: 'Client', schema: ClientSchema}
    ])
  ],
  controllers: [ReportingController],
  providers: [JwtStrategy, ReportingService]
})
export class ReportingModule {}
