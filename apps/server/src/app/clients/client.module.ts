import {Module} from '@nestjs/common';
import {ClientService} from './service/client.service';
import {ClientController} from './controller/client.controller';
import {MongooseModule} from '@nestjs/mongoose';
import {ClientSchema} from './schemas/client.schema';
import {BookingSchema} from '../bookings/schemas/booking.schema';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';

@Module({
  imports: [
    AuthorizationModule,
    // `Booking` is registered here so `ClientService.deleteClient` can refuse a client that
    // a booking still references (T059) without reaching into the bookings module. The same
    // shape `ReportingModule` uses to read bookings.
    MongooseModule.forFeature([
      {name: 'Client', schema: ClientSchema},
      {name: 'Booking', schema: BookingSchema}
    ])
  ],
  controllers: [ClientController],
  providers: [JwtStrategy, ClientService]
})
export class ClientModule {}
