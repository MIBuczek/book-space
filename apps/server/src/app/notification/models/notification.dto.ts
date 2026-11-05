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
  @Validator.IsNotEmpty({message: 'Person is required'})
  person!: string;

  @Validator.IsEmail({}, {message: 'A valid email is required'})
  email!: string;

  @Validator.IsString()
  @Validator.IsNotEmpty({message: 'Message is required'})
  message!: string;

  @Validator.IsOptional()
  @Validator.IsString()
  phone?: string;

  @Validator.IsOptional()
  @Validator.IsEmail({}, {message: 'Recipient must be a valid email'})
  recipient?: string;
}

export {NOTIFICATION_AUDIENCES};
export type {TNotificationAudience};
