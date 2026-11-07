import {IBookedTimeSummary} from '@models/reporting.model';

/**
 * The legacy "N rezerwacji, w tym M zrealizowanych." counter, for one city's bookings
 * (`summaryTotalBookingsNumber` in `summary-functions.ts`).
 *
 * It lives in this shared library, not in the server, because two consumers print it: the CSV
 * export and the printable report (FR-030). T028's acceptance criterion is that the report's
 * per-city totals match this function's output, so a copy in the UI would be the drift the
 * constitution's single-source principle forbids — and it would only show up as a report that
 * disagreed with the export it is supposed to match.
 *
 * It counts every *slot* (not booking) as one reservation, and the `DONE` slots separately, so
 * "3 rezerwacji, w tym 2 zrealizowanych" means three rented hours of which two were completed.
 */
const summaryTotalBookingsNumber = (bookings: IBookedTimeSummary[]): string => {
  let all = 0;
  let done = 0;
  for (const entry of bookings) {
    all += entry.bookingTimeDetails.length;
    done += entry.bookingTimeDetails.filter((slot) => slot.status === 'DONE').length;
  }
  if (all === 0) {
    return '0 rezerwacji.';
  }
  return `${all} rezerwacji, w tym ${done} zrealizowanych.`;
};

export {summaryTotalBookingsNumber};
