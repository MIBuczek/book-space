import {BadGatewayException, HttpException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {ConfigService} from '@nestjs/config';
import {Model} from 'mongoose';
import {Booking} from '../../bookings/schemas/booking.schema';
import {Building} from '../../buildings/schemas/building.schema';
import {StructuredLogger} from '../../logging/structured-logger';
import {currentActorId} from '../../logging/request-context';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {IMailMessage, IMailTransport, MAIL_TRANSPORT} from '../mail/mail-transport';
import {INotifiableBooking, bookingEmail} from '../mail/booking-email';
import {renderTemplate} from '../templates/render';
import {NOTIFICATION_TEMPLATES} from '../templates/templates';
import {BookingNotificationDto, MessageDto} from '../models/notification.dto';

/** The recipient address an audience resolves to. */
const STAFF_AUDIENCE = 'STAFF';
const FACILITY_AUDIENCE = 'FACILITY';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    @InjectModel('Building') private buildingModel: Model<Building>,
    @Inject(MAIL_TRANSPORT) private readonly transport: IMailTransport,
    private readonly configService: ConfigService,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Sends a booking notification to the facility or to SISK staff (FR-032, FR-033).
   *
   * The recipient is resolved server-side: the facility address from the facility record, the
   * staff address from configuration. Neither is taken from the request, so a caller cannot
   * redirect the notification, and neither is in the client bundle (FR-035).
   *
   * A provider failure answers `502` and never touches the booking (FR-036): the booking is
   * read, not written, so there is nothing to roll back, and the operator is told the send
   * failed rather than being shown a success for a message that did not go out.
   */
  async notifyBooking(request: BookingNotificationDto): Promise<{status: string}> {
    const booking = await this.loadBooking(request.bookingId);
    const recipient = await this.resolveRecipient(request.audience, booking);

    const isFacility = request.audience === FACILITY_AUDIENCE;
    // The facility variant carries `buildingEmail` and joins slots with a newline; the staff
    // variant has neither, matching the legacy `emailAdminBodyBooking`/`emailUserBodyBooking`
    // split (contracts/notification-templates.md).
    const templateId = isFacility ? 'booking-facility' : 'booking-staff';
    const {subject, text} = bookingEmail(
      booking,
      templateId,
      isFacility ? recipient : undefined
    );

    await this.send({to: recipient, subject, text}, {
      bookingId: String(booking._id),
      audience: request.audience,
    });
    return {status: 'sent'};
  }

  /**
   * Sends a contact-form or facility-employee message (FR-034, FR-041).
   *
   * With a `recipient` the message goes to that facility employee; without one it goes to the
   * SISK inbox from configuration. The sender's address is carried in the body so the recipient
   * can answer the visitor directly, which the legacy form's fields imply and a plain body does
   * not carry.
   */
  async sendMessage(request: MessageDto): Promise<{status: string}> {
    const recipient = request.recipient ?? this.configService.get<string>('SISK_CONTACT_EMAIL');
    if (!recipient) {
      throw new BadGatewayException('The contact mailbox is not configured (set SISK_CONTACT_EMAIL)');
    }

    // The employee variant is the Facilities-tab message (FR-041); the contact variant is the
    // public form (FR-034). They differ only in the recipient and whether the sender's phone is
    // carried, so the templates are separate but the variable set is shared.
    const templateId = request.recipient ? 'employee-message' : 'contact-message';
    const {subject, text} = renderTemplate(NOTIFICATION_TEMPLATES[templateId], {
      person: request.person,
      email: request.email,
      phone: request.phone,
      message: request.message,
    });

    await this.send({to: recipient, subject, text}, {
      audience: request.recipient ? 'EMPLOYEE' : 'CONTACT',
    });
    return {status: 'sent'};
  }

  /**
   * Resolves the recipient for a booking audience.
   *
   * A facility notification needs the facility's contact address; a booking whose facility is
   * missing or has no address cannot be notified, which is a `404` rather than a silent no-op.
   * The staff audience needs the configured SISK inbox; without it the send is refused, because
   * "notify staff" with no address would otherwise report success for a message that went
   * nowhere.
   */
  private async resolveRecipient(
    audience: string,
    booking: INotifiableBooking & {_id?: unknown}
  ): Promise<string> {
    if (audience === STAFF_AUDIENCE) {
      const staff = this.configService.get<string>('SISK_CONTACT_EMAIL');
      if (!staff) {
        throw new BadGatewayException('The staff mailbox is not configured (set SISK_CONTACT_EMAIL)');
      }
      return staff;
    }

    // The filter is a plain record rather than a typed `FilterQuery<Building>`: `city` is a
    // string on the booking but an enum union on the building, and Mongoose's overloads reject
    // the wider type. `BookingService.assertSizeOffered` builds its facility filter the same way.
    const filter: Record<string, unknown> = {property: booking.place.place};
    if (booking.place.city !== undefined) {
      filter.city = booking.place.city;
    }
    const facility = await this.buildingModel.findOne(filter, {email: 1});
    if (!facility?.email) {
      throw new NotFoundException('The booking facility has no contact address');
    }
    return facility.email;
  }

  private async loadBooking(bookingId: string): Promise<INotifiableBooking & {_id?: unknown}> {
    let booking: (INotifiableBooking & {_id?: unknown}) | null;
    try {
      booking = (await this.bookingModel.findOne({_id: bookingId}).lean()) as unknown as
        | (INotifiableBooking & {_id?: unknown})
        | null;
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  /**
   * Sends through the transport and maps a failure to `502`.
   *
   * The failure is logged with the booking it belonged to and the provider's answer, because
   * a failure is only actionable if the record says which send failed (FR-036). The recipient
   * address is left to the logger's redaction rather than printed here.
   */
  private async send(message: IMailMessage, context: {bookingId?: string; audience: string}): Promise<void> {
    try {
      await this.transport.send(message);
      this.logger.log('notification.sent', {...context, actorId: currentActorId()});
    } catch (e) {
      const response = errorMessage(e);
      this.logger.notificationFailure({bookingId: context.bookingId, provider: 'mail', response});
      throw new BadGatewayException('The notification could not be sent');
    }
  }
}
