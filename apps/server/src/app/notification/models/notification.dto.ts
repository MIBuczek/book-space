import * as Validator from 'class-validator';

/** The audiences a booking notification can address (contracts/openapi.yaml). */
const NOTIFICATION_AUDIENCES = ['FACILITY', 'STAFF', 'APPLICANT'] as const;
type TNotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * The body of `POST /notifications/booking` (FR-032, FR-033, FR-052).
 *
 * `audience` is the operator's opt-in: `FACILITY` notifies the facility the booking is for
 * (FR-032), `STAFF` notifies the tenant inbox that a public request arrived (FR-033), and
 * `APPLICANT` notifies the person who requested the booking that it was approved or rejected
 * (FR-052, T062). The recipient address is never taken from the body — it is resolved
 * server-side from the booking's facility, from configuration, or from the booking's own
 * `personEmail` — so a caller cannot redirect a notification.
 *
 * `APPLICANT` is administrator-only, the same rule the approve/reject routes carry: it is the
 * decision notification for a booking an administrator has just decided, so a non-administrator
 * is refused rather than allowed to mail the requestor on an administrator's behalf. The
 * controller enforces it (it needs the authenticated role, which the body cannot be trusted to
 * name); this comment records *why* the audience exists.
 */
export class BookingNotificationDto {
  @Validator.IsString()
  @Validator.IsNotEmpty({message: 'Booking id is required'})
  bookingId!: string;

  @Validator.IsIn(NOTIFICATION_AUDIENCES as unknown as string[], {
    message: 'Audience must be FACILITY, STAFF or APPLICANT'
  })
  audience!: TNotificationAudience;
}

/**
 * The body of `POST /notifications/message` (FR-034, FR-041).
 *
 * With a `recipient` it is a message to a selected facility employee (FR-041); without one it
 * is the public contact-form message delivered to the tenant inbox (FR-034).
 */
export class MessageDto {
  @Validator.IsString()
  @Validator.Length(1, 125, {message: 'Person can have between 1 and 125 characters'})
  person!: string;

  @Validator.IsEmail({}, {message: 'A valid email is required'})
  @Validator.MaxLength(125, {message: 'Email can have maximal 125 characters'})
  email!: string;

  @Validator.IsString()
  @Validator.Length(1, 2000, {message: 'Message can have between 1 and 2000 characters'})
  message!: string;

  @Validator.IsOptional()
  @Validator.IsString()
  @Validator.MaxLength(20, {message: 'Phone can have maximal 20 characters'})
  phone?: string;

  /**
   * The destination (FR-041).
   *
   * A syntactically valid address is not sufficient: `NotificationService` allow-lists it
   * against a facility's contact address before sending, so the public route cannot be used
   * to deliver the tenant-branded employee template to an arbitrary inbox (issue #124). The
   * field stays an e-mail here so a malformed value is a `422` at the boundary; the
   * allow-list is the service's job, because it needs the database.
   */
  @Validator.IsOptional()
  @Validator.IsEmail({}, {message: 'Recipient must be a valid email'})
  @Validator.MaxLength(125, {message: 'Recipient can have maximal 125 characters'})
  recipient?: string;

  /**
   * The bot-mitigation decoy (FR-049). Declared so `whitelist` keeps it; a non-empty value is
   * refused by `HoneypotGuard` with `422`.
   */
  @Validator.IsOptional()
  @Validator.IsString()
  website?: string;
}

export {NOTIFICATION_AUDIENCES};
export type {TNotificationAudience};
