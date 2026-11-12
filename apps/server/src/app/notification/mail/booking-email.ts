import {IBookedTime} from '@models/booked-time.model';
import {displayValue, formatDate, formatTime} from '../../reporting/csv/display';
import {renderTemplate, TTemplateVariables} from '../templates/render';
import {DEFAULT_TENANT_NAME, NOTIFICATION_TEMPLATES, TTemplateId} from '../templates/templates';

/**
 * The booking fields a notification e-mail reads. Structural, so the formatter is testable
 * without Mongoose and a schema rename shows up here as a type error.
 */
interface INotifiableBooking {
  _id?: unknown;
  place: {place: string; city: string};
  personName: string;
  personCompany?: string;
  personEmail: string;
  personPhone: string;
  paymentMethod: string;
  comments?: string;
  bookedTimes: IBookedTime[];
}

/**
 * One slot, in the legacy `flatBookingTime` shape (day, start, end), on one line.
 *
 * The legacy builder emitted a multi-line template literal per slot and then joined the array
 * with `replace(',', '\n')` — which replaced only the first comma and left the rest of the
 * array on one line. Producing one line per slot and joining explicitly is the intent the
 * legacy code was reaching for, and it makes the join separator the only difference between
 * the two variants.
 */
const flatBookingTime = (slot: IBookedTime): string =>
  `Rezerwacja na dzień : ${formatDate(slot.day)}, ` +
  `Godzina rozpoczęcia : ${formatTime(slot.startHours)}, ` +
  `Godzina zakończenia : ${formatTime(slot.endHours)}`;

/**
 * The slot lines joined the way each variant joins them (legacy `emailAdminBodyBooking` used a
 * newline, `emailUserBodyBooking` used `" / "`).
 */
const joinSlots = (bookedTimes: IBookedTime[], separator: string): string =>
  bookedTimes.map(flatBookingTime).join(separator);

/**
 * The template variables for a booking, in the legacy field set (`emailAdminBodyBooking` /
 * `emailUserBodyBooking`). `buildingEmail` is supplied only for the facility variant; the
 * renderer treats an absent value as an optional block, and the facility template is the only
 * one that declares it.
 *
 * An empty optional field is normalised to `undefined` so the renderer drops its block rather
 * than rendering a labelled blank line.
 *
 * `tenantName` signs the applicant e-mails (FR-033); it comes from configuration and falls back
 * to `Book Space`, so the brand is a deployment setting rather than a literal in the template.
 */
const bookingVariables = (
  booking: INotifiableBooking,
  buildingEmail?: string,
  tenantName: string = DEFAULT_TENANT_NAME
): TTemplateVariables => ({
  building: displayValue(booking.place.place),
  city: displayValue(booking.place.city),
  payment: displayValue(booking.paymentMethod),
  person: booking.personName,
  club: booking.personCompany || undefined,
  email: booking.personEmail,
  phone: booking.personPhone,
  // The legacy split: the facility variant joins slots with a newline, the staff variant with
  // `" / "` (contracts/notification-templates.md).
  parsedBookingTime: joinSlots(booking.bookedTimes, buildingEmail !== undefined ? '\n' : ' / '),
  message: booking.comments || undefined,
  buildingEmail,
  tenantName,
});

/** The subject and body of a booking notification, rendered from its template. */
const bookingEmail = (
  booking: INotifiableBooking,
  templateId: TTemplateId,
  buildingEmail?: string,
  tenantName: string = DEFAULT_TENANT_NAME
): {subject: string; text: string} =>
  renderTemplate(NOTIFICATION_TEMPLATES[templateId], bookingVariables(booking, buildingEmail, tenantName));

export {flatBookingTime, joinSlots, bookingVariables, bookingEmail};
export type {INotifiableBooking};
