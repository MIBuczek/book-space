import * as Validator from 'class-validator';

/** The audiences a booking notification can address (contracts/openapi.yaml). */
const NOTIFICATION_AUDIENCES = ['FACILITY', 'STAFF'] as const;
type TNotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * The body of `POST /notifications/booking` (FR-032, FR-033).
 *
 * `audience` is the operator's opt-in: `FACILITY` notifies the facility the booking is for
 * (FR-032), `STAFF` notifies the SISK inbox that a public request arrived (FR-033). The
 * recipient address is never taken from the body — it is resolved server-side from the
 * booking's facility or from configuration — so a caller cannot redirect a notification.
 */
export class BookingNotificationDto {
  @Validator.IsString()
  @Validator.IsNotEmpty({message: 'Booking id is required'})
  bookingId!: string;

  @Validator.IsIn(NOTIFICATION_AUDIENCES as unknown as string[], {
    message: 'Audience must be FACILITY or STAFF'
  })
  audience!: TNotificationAudience;
}

/**
 * The body of `POST /notifications/message` (FR-034, FR-041).
 *
 * With a `recipient` it is a message to a selected facility employee (FR-041); without one it
 * is the public contact-form message delivered to the SISK inbox (FR-034).
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
   * to deliver the SISK-branded employee template to an arbitrary inbox (issue #124). The
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
