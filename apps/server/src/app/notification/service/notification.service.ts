import {BadGatewayException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
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
import {OutboundQuotaService} from '../../security/quota/outbound-quota.service';

/** The recipient address an audience resolves to. */
const STAFF_AUDIENCE = 'STAFF';
const FACILITY_AUDIENCE = 'FACILITY';
const APPLICANT_AUDIENCE = 'APPLICANT';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    @InjectModel('Building') private buildingModel: Model<Building>,
    @Inject(MAIL_TRANSPORT) private readonly transport: IMailTransport,
    private readonly configService: ConfigService,
    private readonly quota: OutboundQuotaService,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Sends a booking notification to the facility, to SISK staff, or to the applicant
   * (FR-032, FR-033, FR-052).
   *
   * The recipient is resolved server-side: the facility address from the facility record, the
   * staff address from configuration, the applicant address from the booking's own
   * `personEmail`. None is taken from the request, so a caller cannot redirect the
   * notification, and none is in the client bundle (FR-035).
   *
   * The `APPLICANT` audience is the decision notification (T062): the template is selected from
   * the booking's **stored** `accepted` flag, not from anything the caller sends, so the
   * message cannot claim a decision the booking does not carry. The flag is read from the
   * document, which is the same value the approve route wrote.
   *
   * A provider failure answers `502` and never touches the booking (FR-036): the booking is
   * read, not written, so there is nothing to roll back, and the operator is told the send
   * failed rather than being shown a success for a message that did not go out.
   */
  async notifyBooking(request: BookingNotificationDto): Promise<{status: string}> {
    const booking = await this.loadBooking(request.bookingId);

    if (request.audience === APPLICANT_AUDIENCE) {
      return this.notifyApplicant(booking);
    }

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
   * Sends the approval/rejection decision to the applicant (FR-052, T062).
   *
   * The recipient is the booking's own `personEmail`, so the message goes to the person who
   * asked, never to an address the caller names. The template is chosen from the stored
   * `accepted` flag: `booking-approved` when the booking is accepted, `booking-rejected`
   * otherwise. That is the decision the administrator already made through
   * `POST /bookings/{_id}/approve`, and reading it here rather than accepting it in the body is
   * what keeps the e-mail and the record from disagreeing.
   *
   * A booking with no applicant address cannot be notified, which is a `404` rather than a
   * silent no-op: `personEmail` is required on the schema, so its absence is a data problem
   * the operator should see, not a message that quietly reports success.
   */
  private async notifyApplicant(booking: INotifiableBooking & {_id?: unknown; accepted?: boolean}): Promise<{status: string}> {
    const recipient = booking.personEmail;
    if (!recipient) {
      throw new NotFoundException('The booking has no applicant address');
    }

    const templateId = booking.accepted ? 'booking-approved' : 'booking-rejected';
    const {subject, text} = bookingEmail(booking, templateId);

    await this.send({to: recipient, subject, text}, {
      bookingId: String(booking._id),
      audience: APPLICANT_AUDIENCE,
    });
    return {status: 'sent'};
  }

  /**
   * Sends a contact-form or facility-employee message (FR-034, FR-041, FR-050).
   *
   * Two shapes, told apart by `recipient`:
   *
   * - **without `recipient`** it is the public contact form (FR-034) and the message goes to
   *   the SISK inbox from configuration;
   * - **with `recipient`** it is the Facilities-tab message to a facility employee (FR-041).
   *   That path is *staff only* and the address must be a facility's contact address.
   *
   * The allow-list is the fix for issue #124. `recipient` used to be sent to directly, so the
   * public route — which requires no credential — would deliver the SISK-branded
   * `employee-message` template to any syntactically valid address a caller named: an open
   * relay. Now the address is only honoured when the caller is authenticated staff (`isPublic`
   * is `false`) and the address matches a facility's stored `email`. A public caller who sends
   * a `recipient` is refused with `403`; a staff caller whose address matches no facility is
   * refused with `422`, so a typo is distinguished from an authorisation failure.
   *
   * The outbound quota (FR-050) is checked after the recipient resolves and before the
   * transport is called, so a message that would exceed the per-recipient cap is a `429` that
   * never reaches the provider — the send that would have cost the operator money does not
   * happen. The quota counts the *resolved* recipient, so the SISK inbox and each facility
   * address each have their own ceiling.
   */
  async sendMessage(request: MessageDto, isPublic: boolean): Promise<{status: string}> {
    const recipient = request.recipient
      ? await this.resolveEmployeeRecipient(request.recipient, isPublic)
      : this.configService.get<string>('SISK_CONTACT_EMAIL');

    if (!recipient) {
      throw new BadGatewayException('The contact mailbox is not configured (set SISK_CONTACT_EMAIL)');
    }

    this.quota.assertAllowed(recipient);

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
   * Resolves an employee-message recipient, refusing anything but a facility's contact address.
   *
   * `isPublic` is the caller's kind (fail-closed: `true` unless the request was positively
   * marked staff). A public caller may never name a recipient, because the public contact form
   * does not offer one and the only reason to send one is to reach an employee. A staff caller
   * may, but only to an address a facility record already carries — so the module can still be
   * used as an open relay only by someone who could already edit the facilities.
   *
   * The comparison is case-insensitive (addresses are case-insensitive in practice, and the
   * schema stores the facility address lower-cased). A staff address that matches no facility
   * is a `422` rather than a `404`: the *field* is wrong, not the resource.
   */
  private async resolveEmployeeRecipient(recipient: string, isPublic: boolean): Promise<string> {
    if (isPublic) {
      this.logger.warn('notification.message.rejected', {actorId: currentActorId(), reason: 'public_recipient'});
      throw new ForbiddenException('A recipient may only be named by staff');
    }

    const facility = await this.buildingModel.findOne(
      {email: recipient.trim().toLowerCase()},
      {email: 1}
    );
    if (!facility?.email) {
      throw new UnprocessableEntityException('The recipient is not a facility contact address');
    }
    return facility.email;
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
