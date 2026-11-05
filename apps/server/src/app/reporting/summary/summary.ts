import {IClient} from '@models/client.model';
import {IBookedTime} from '@models/booked-time.model';
import {ISelectedExtraOption} from '@models/selected-extra-option.model';
import {
  IBookedTimeSummary,
  IClientSummary,
  IGeneralBookingDetails,
  SUMMARY_CITIES,
  TCitySummary,
  TSummaryCity,
} from '@models/reporting.model';

/**
 * The month range a summary is taken over, in the facility's calendar.
 *
 * Both bounds are inclusive, reproducing the legacy
 * `changeDayInDateStart(fromMonth, 1)` … `changeDayInDateEnd(toMonth, lastDay)` window. The
 * caller resolves a month to its boundaries (see `resolveSummaryRange`), so this module does
 * no calendar arithmetic and stays pure and testable.
 */
interface ISummaryRange {
  /** When true, every accepted booking is included regardless of `from`/`to`. */
  fromTheBeginning: boolean;
  /** Inclusive lower bound, or `undefined` when `fromTheBeginning` is set. */
  from?: Date;
  /** Inclusive upper bound, or `undefined` when `fromTheBeginning` is set. */
  to?: Date;
}

/**
 * A booking as the summary needs to read it. Structural rather than the hydrated document, so
 * the aggregation can be unit-tested without Mongoose and a field rename in the schema shows
 * up here as a type error.
 */
interface ISummaryBooking {
  clientId?: string;
  accepted: boolean;
  place: {place: string; city: string};
  size: string;
  paymentMethod: string;
  discount?: string;
  extraOptions: boolean;
  selectedOptions: ISelectedExtraOption[];
  comments?: string;
  bookedTimes: IBookedTime[];
}

/** Whether a slot's day falls inside the range, mirroring the legacy inclusive comparison. */
const slotInRange = (day: Date, range: ISummaryRange): boolean => {
  if (range.fromTheBeginning) {
    return true;
  }
  if (range.from === undefined || range.to === undefined) {
    // A partial range is not "everything": an unbounded read is the exposure FR-043 names, and
    // treating a missing bound as open-ended would silently include the whole history.
    return false;
  }
  const time = new Date(day).getTime();
  return time >= range.from.getTime() && time <= range.to.getTime();
};

/** The empty per-city structure, so a city with no bookings is still present in the answer. */
const emptyCitySummary = (): TCitySummary =>
  SUMMARY_CITIES.reduce((acc, city) => {
    acc[city] = [];
    return acc;
  }, {} as TCitySummary);

const isSummaryCity = (value: string): value is TSummaryCity =>
  (SUMMARY_CITIES as readonly string[]).includes(value);

/**
 * The booking-level fields a summary repeats for each slot.
 *
 * `discount` is normalised to `''` when absent, matching the legacy destructuring default, so
 * a CSV cell is empty rather than `undefined`.
 */
const generalDetails = (booking: ISummaryBooking): IGeneralBookingDetails => ({
  payment: booking.paymentMethod,
  discount: booking.discount ?? '',
  extraOptions: booking.extraOptions,
  selectedOptions: booking.selectedOptions,
  comments: booking.comments,
  size: booking.size,
  building: booking.place.place,
});

/**
 * Builds one client's summary: accepted bookings only, grouped by the booking's facility city,
 * with each booking's slots filtered to the range. A booking whose slots all fall outside the
 * range is dropped entirely, matching the legacy `isEmpty(bookingTimeDetails)` early return —
 * otherwise the report would list a booking with no rented time against it.
 */
const summariseClient = (
  client: IClient,
  bookings: ISummaryBooking[],
  range: ISummaryRange
): IClientSummary => {
  const summary: IClientSummary = {client, ...emptyCitySummary()};

  for (const booking of bookings) {
    if (!booking.accepted) {
      continue;
    }
    const city = booking.place.city;
    if (!isSummaryCity(city)) {
      continue;
    }

    const bookingTimeDetails = booking.bookedTimes.filter((slot) => slotInRange(slot.day, range));
    if (bookingTimeDetails.length === 0) {
      continue;
    }

    summary[city] = [...summary[city], {generalBookingDetails: generalDetails(booking), bookingTimeDetails}];
  }

  return summary;
};

/** The legacy "N rezerwacji, w tym M zrealizowanych." counter, for one city's bookings. */
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

export {slotInRange, summariseClient, summaryTotalBookingsNumber, isSummaryCity};
export type {ISummaryRange, ISummaryBooking};
