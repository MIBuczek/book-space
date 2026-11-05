import {IClient} from '@models/client.model';
import {IBookedTime} from '@models/booked-time.model';
import {TCSVRow} from '@models/reporting.model';
import {CSV_COLUMNS} from './csv-columns';
import {ISummaryBooking, ISummaryRange, slotInRange} from '../summary/summary';
import {displayBoolean, displaySelectedOptions, displayValue, formatDate, formatTime, toPercentage} from './display';

/**
 * One client's CSV rows: one row per booked slot, over the accepted bookings whose slots fall
 * in the range. Transcribed from the legacy `csvClientSummary`.
 *
 * Every column is emitted as a string; a missing value is `''`, never `undefined` or `null`,
 * so a row has exactly one cell per column and the file's columns stay aligned. The legacy
 * `changeObjectShape` did the same (`String(value)` or `''`).
 */
const clientCsvRows = (client: IClient, bookings: ISummaryBooking[], range: ISummaryRange): TCSVRow[] => {
  const rows: TCSVRow[] = [];

  for (const booking of bookings) {
    if (!booking.accepted) {
      continue;
    }

    for (const slot of booking.bookedTimes) {
      if (!slotInRange(slot.day, range)) {
        continue;
      }
      rows.push(bookingRow(client, booking, slot));
    }
  }

  return rows;
};

/**
 * One CSV row, keyed by the column keys in `CSV_COLUMNS`.
 *
 * The client fields and the booking fields share the row, as in the legacy report: the same
 * client block repeats on every slot row so a spreadsheet can pivot without a lookup. `city`
 * is the client's city and `cityBooking` the booking's facility city — two different things
 * the legacy headers keep distinct.
 */
const bookingRow = (client: IClient, booking: ISummaryBooking, slot: IBookedTime): TCSVRow => {
  const firstOption = booking.selectedOptions[0];

  return {
    name: client.name ?? '',
    type: client.type ?? '',
    contactPerson: client.contactPerson ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    street: client.street ?? '',
    city: client.city ?? '',
    zipCode: client.zipCode ?? '',
    nip: client.nip ?? '',
    cityBooking: displayValue(booking.place.city),
    building: displayValue(booking.place.place),
    size: toPercentage(booking.size),
    payment: displayValue(booking.paymentMethod),
    discount: booking.discount ?? '',
    day: formatDate(slot.day),
    startHour: formatTime(slot.startHours),
    endHour: formatTime(slot.endHours),
    participants: slot.participants === undefined ? '' : String(slot.participants),
    status: displayValue(slot.status),
    extraOptions: displayBoolean(booking.extraOptions),
    selectedOptions: displaySelectedOptions(booking.selectedOptions),
    startHourOption: firstOption ? formatTime(firstOption.fromHour) : '',
    endHourOption: firstOption ? formatTime(firstOption.toHour) : '',
    message: booking.comments ?? '',
  };
};

/**
 * The header row, in column order. Labels are emitted as-is; the CSV serializer quotes them if
 * they contain a separator.
 */
const csvHeader = (): string[] => CSV_COLUMNS.map((column) => column.label);

/**
 * Serialises rows to the semicolon-separated CSV the business consumes (FR-028): `;` separator,
 * CRLF line endings, and a UTF-8 BOM prefix.
 *
 * The separator is `;` rather than `,` because the legacy export used it and the downstream
 * spreadsheets are configured for it; a comma-separated file would open as a single column. A
 * value is quoted only when it contains a separator, a quote or a newline, which keeps the
 * common row compact while staying valid — and a doubled quote is the CSV escape. The BOM is
 * what makes Excel read the Polish characters as UTF-8 instead of the system code page.
 */
const toCsv = (rows: TCSVRow[]): string => {
  const lines = [csvHeader(), ...rows.map((row) => CSV_COLUMNS.map((column) => row[column.key] ?? ''))];
  const body = lines.map((cells) => cells.map(escapeCell).join(';')).join('\r\n');
  return `\uFEFF${body}\r\n`;
};

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export {clientCsvRows, csvHeader, toCsv, escapeCell};
