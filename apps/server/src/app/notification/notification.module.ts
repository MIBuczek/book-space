import {Module} from '@nestjs/common';
import {MongooseModule} from '@nestjs/mongoose';
import {ConfigService} from '@nestjs/config';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';
import {BookingSchema} from '../bookings/schemas/booking.schema';
import {BuildingSchema} from '../buildings/schemas/building.schema';
import {StructuredLogger} from '../logging/structured-logger';
import {NotificationService} from './service/notification.service';
import {NotificationController} from './controller/notification.controller';
import {
  HttpMailTransport,
  IMailConfig,
  IMailTransport,
  MAIL_TRANSPORT,
  UnconfiguredMailTransport
} from './mail/mail-transport';

/**
 * Chooses the mail transport at construction: an HTTP transport when the provider is
 * configured, otherwise a transport that fails every send. The choice is made once here rather
 * than inside the service, so the service depends only on the `IMailTransport` interface and
 * the tests can substitute a real local server by overriding this provider.
 *
 * The settings come from the server environment (FR-035): `MAIL_ENDPOINT`, optional
 * `MAIL_API_KEY` and `MAIL_FROM`. Nothing here reaches the client bundle.
 */
const mailTransportProvider = {
  provide: MAIL_TRANSPORT,
  useFactory: (configService: ConfigService, logger: StructuredLogger): IMailTransport => {
    const endpoint = configService.get<string>('MAIL_ENDPOINT');
    const from = configService.get<string>('MAIL_FROM');
    if (!endpoint || !from) {
      return new UnconfiguredMailTransport();
    }
    const config: IMailConfig = {endpoint, from, apiKey: configService.get<string>('MAIL_API_KEY')};
    return new HttpMailTransport(config, logger);
  },
  inject: [ConfigService, StructuredLogger]
};

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([
      {name: 'Booking', schema: BookingSchema},
      {name: 'Building', schema: BuildingSchema}
    ])
  ],
  providers: [JwtStrategy, NotificationService, mailTransportProvider],
  controllers: [NotificationController]
})
export class NotificationModule {}
