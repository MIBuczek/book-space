import {IBookedTime} from '@models/booked-time.model';
import {formatDate, formatTime} from '../../reporting/csv/display';

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
 * The slot lines, one per booked time, in the legacy `flatBookingTime` shape (day, start, end).
 * The legacy code joined these with `replace(',', '\n')`, which replaced only the first comma
 * and left the rest on one line; joining with a newline outright is the intent.
 */
const slotLines = (bookedTimes: IBookedTime[]): string =>
  bookedTimes
    .map(
      (slot) =>
        `Rezerwacja na dzień : ${formatDate(slot.day)}, ` +
        `Godzina rozpoczęcia : ${formatTime(slot.startHours)}, ` +
        `Godzina zakończenia : ${formatTime(slot.endHours)}`
    )
    .join('\n');

/** The subject line, naming the facility and city so an inbox can triage by subject alone. */
const bookingSubject = (booking: INotifiableBooking, isFacility: boolean): string =>
  isFacility
    ? `Nowa rezerwacja: ${booking.place.place} (${booking.place.city})`
    : `Nowa prośba o rezerwację: ${booking.place.place} (${booking.place.city})`;

/**
 * The e-mail body. Both audiences get the same facts — the difference is who receives it, not
 * what it says — so there is one formatter rather than the legacy's two near-identical
 * `emailAdminBodyBooking`/`emailUserBodyBooking`.
 */
const bookingEmailBody = (booking: INotifiableBooking): string =>
  [
    `Obiekt: ${booking.place.place} (${booking.place.city})`,
    `Osoba: ${booking.personName}`,
    booking.personCompany ? `Firma: ${booking.personCompany}` : undefined,
    `Email: ${booking.personEmail}`,
    `Telefon: ${booking.personPhone}`,
    `Płatność: ${booking.paymentMethod}`,
    slotLines(booking.bookedTimes),
    booking.comments ? `Wiadomość: ${booking.comments}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

export {slotLines, bookingSubject, bookingEmailBody};
export type {INotifiableBooking};
