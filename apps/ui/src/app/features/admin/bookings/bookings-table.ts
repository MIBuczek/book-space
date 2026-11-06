import {IBooking} from '@models/booking.model';
import {IBookedTime, TSingleBookingStatus} from '@models/booked-time.model';
import {TCity} from '@models/building.model';
import {
  academicYearStartYear,
  atFacilityTime,
  formatFacilityDate,
  formatFacilityTime,
  startOfFacilityDay,
} from '@booking/date-time';

/**
 * The admin bookings table's pure logic (FR-017, FR-018, FR-020, FR-021, FR-022).
 *
 * Everything here is a function over plain values so the period options, the row shaping and
 * the slot rules are unit-testable without a rendered table — the same shape
 * `calendar-events.ts` gives the calendar and `booking-request-form.ts` the public form. The
 * component holds signals and calls these; it does not re-derive a label or decide an
 * action's availability inline.
 */

/** A period the table can load, matching the legacy `generateBookingDateOptions`. */
interface IPeriodOption {
  /** The option's value, used as the `<select>` value. */
  value: string;
  label: string;
  /** The academic year's start year, or `null` for "from the beginning". */
  startYear: number | null;
}

/** The resolved period a selection loads. */
interface IResolvedPeriod {
  /** Inclusive lower bound, always present so the conflict counter has a scope. */
  from: Date;
  /** Inclusive upper bound. */
  to: Date;
  /**
   * Whether to skip the bounds and load every record. The list treats it as an
   * administrator-only widening; the conflict counter still needs `from`/`to`, which is why
   * they are always resolved.
   */
  all: boolean;
}

const FROM_THE_BEGINNING = 'all';

/** The Polish labels for the four cities, matching the legacy `CITY_OPTIONS`. */
const CITY_LABELS: Record<TCity, string> = {
  siechnice: 'Siechnice',
  radwanice: 'Radwanice',
  'swieta-katarzyna': 'Święta Katarzyna',
  'zerniki-wroclawskie': 'Żerniki Wrocławskie',
};

/** The page sizes the table offers, matching the legacy `SIZE_OPTIONS`. */
const PAGE_SIZES = [20, 50, 100];

/**
 * The periods the table offers (FR-020).
 *
 * The legacy `generateBookingDateOptions` listed "Od początku" plus one entry per academic
 * year from 2022 up to the current one — and, until September, omitted the year that had just
 * started, because its month test was a month late (the same defect `@booking/date-time`
 * corrects). This derives the list from the corrected academic-year start, so the newest
 * option is the year currently running and the list is continuous back to the first season the
 * platform covers.
 */
const periodOptions = (now: Date, firstYear = 2022): IPeriodOption[] => {
  const currentStart = academicYearStartYear(now);
  const options: IPeriodOption[] = [
    {value: FROM_THE_BEGINNING, label: 'Od początku', startYear: null},
  ];

  for (let year = currentStart; year >= firstYear; year -= 1) {
    options.push({value: String(year), label: `${year}/${year + 1}`, startYear: year});
  }

  return options;
};

/**
 * Resolves a period selection into the request's bounds.
 *
 * "From the beginning" is `all: true` rather than a `2020-01-01` lower bound: the contract has
 * an `all` flag that skips the academic-year default, and an unbounded read is what the legacy
 * option meant. The bounds are still resolved for the conflict counter, which is scoped to one
 * facility and one period — a `from`/`to` pair is required there — so "from the beginning"
 * widens the *list* while the counter covers the same span the table shows.
 *
 * The bounds are the facility-local academic year, so a booking created at 00:30 on 1 August
 * belongs to the year that starts that day (R4).
 */
const resolvePeriod = (value: string, options: IPeriodOption[], now: Date): IResolvedPeriod => {
  const option = options.find((candidate) => candidate.value === value);
  if (!option || option.startYear === null) {
    // "From the beginning": an unbounded list, and a counter over the platform's whole
    // history. The lower bound is the first season the platform covers.
    const earliest = options[options.length - 1]?.startYear ?? academicYearStartYear(now);
    return {from: startOfFacilityDay(new Date(Date.UTC(earliest, 7, 1, 12))), to: now, all: true};
  }

  const from = startOfFacilityDay(new Date(Date.UTC(option.startYear, 7, 1, 12)));
  const to = new Date(startOfFacilityDay(new Date(Date.UTC(option.startYear + 1, 8, 1, 12))).getTime() - 1);
  return {from, to, all: false};
};

/** The columns the table renders, in the legacy order (`RECORDS_BOOKINGS_HEADERS`). */
const BOOKING_COLUMNS = [
  {key: 'nick', label: 'Nazwa klienta'},
  {key: 'personPhone', label: 'Telefon'},
  {key: 'personEmail', label: 'E-mail'},
  {key: 'acceptedLabel', label: 'Zakceptowana'},
  {key: 'conflictLabel', label: 'Konflikty'},
];

/** The labels for a slot's status, matching the legacy `BOOKING_STATUS_OPTIONS`. */
const STATUS_LABELS: Record<TSingleBookingStatus, string> = {
  INITIAL: 'Początkowa',
  DONE: 'Zakończona',
  CANCELED: 'Anulowana',
};

/** The label for the accepted flag, never colour alone (NFR-006, FR-037). */
const acceptedLabel = (accepted: boolean): string => (accepted ? 'Tak' : 'Nie');

/**
 * Whether a booking is in the conflict set (FR-015).
 *
 * The conflict rule is `!accepted && conflicts.includes(id)` — the same shape the legacy
 * `singleItemConflictHandler` used. An accepted booking is never flagged: it has already been
 * approved, possibly by force, so re-flagging it would report a state the administrator chose
 * to keep.
 */
const hasConflict = (booking: IBooking, conflicts: readonly string[]): boolean =>
  !booking.accepted && conflicts.includes(booking._id);

/** The conflict cell: a word when there is a conflict, empty otherwise (never colour alone). */
const conflictLabel = (booking: IBooking, conflicts: readonly string[]): string =>
  hasConflict(booking, conflicts) ? 'Konflikt' : '';

/** One slot's facility-local day and hour range, `YYYY-MM-DD HH:MM–HH:MM`. */
const slotLabel = (slot: IBookedTime): string =>
  `${formatFacilityDate(new Date(slot.day))} ${formatFacilityTime(new Date(slot.startHours))}–${formatFacilityTime(new Date(slot.endHours))}`;

/** Every slot of a booking as one string, for the table's summary cell. */
const slotsLabel = (booking: IBooking): string => booking.bookedTimes.map(slotLabel).join(', ');

/**
 * Shapes a booking into the row the table renders.
 *
 * The derived labels are computed here so the template reads a value rather than branching,
 * and so the conflict rule is unit-tested rather than reachable only through a rendered cell.
 * `slots` is the slot list itself, because the detail template renders one row per slot.
 */
const toRow = (booking: IBooking, conflicts: readonly string[]): Record<string, unknown> => ({
  _id: booking._id,
  nick: booking.nick,
  personName: booking.personName,
  personPhone: booking.personPhone,
  personEmail: booking.personEmail,
  accepted: booking.accepted,
  acceptedLabel: acceptedLabel(booking.accepted),
  conflictLabel: conflictLabel(booking, conflicts),
  hasConflict: hasConflict(booking, conflicts),
  archive: booking.archive,
  slotsLabel: slotsLabel(booking),
  slots: booking.bookedTimes,
  booking,
});

/**
 * Whether a slot has been resolved (FR-018).
 *
 * A slot whose status is not `INITIAL` has been decided (`DONE` or `CANCELED`) and is
 * immutable: the server refuses a replacement that edits or deletes it, so the UI must not
 * offer the controls. This is the client mirror of `findResolvedSlotViolation`; the server
 * remains the authority, and a client that ignored this would get a `409`.
 */
const isResolved = (slot: IBookedTime): boolean => slot.status !== 'INITIAL';

/**
 * Replaces one slot in a booking's list, leaving the others untouched.
 *
 * The contract's `PUT /bookings/{_id}/booked-times` replaces the *complete* list, so a
 * reschedule and a resolve are both "change one slot, send the list". Building the list here —
 * rather than in the component — keeps that rule in one place and makes it testable. A
 * resolved slot is refused before a request is built, so the UI cannot ask the server to do
 * something it will reject.
 */
const replaceSlot = (
  slots: readonly IBookedTime[],
  index: number,
  replacement: IBookedTime
): IBookedTime[] => {
  if (index < 0 || index >= slots.length) {
    throw new RangeError('Slot index out of range');
  }
  if (isResolved(slots[index])) {
    throw new Error('A resolved slot cannot be edited');
  }
  return slots.map((slot, position) => (position === index ? replacement : slot));
};

/** The opening hour of the facility, matching the legacy form. */
const OPENING_HOUR = 9;
/** The exclusive end of the day, allowed as a slot's end hour (local midnight). */
const END_OF_DAY_HOUR = 24;

/** The start-hour options: 09:00 through 23:00. */
const START_HOURS: number[] = Array.from(
  {length: END_OF_DAY_HOUR - OPENING_HOUR},
  (_, index) => OPENING_HOUR + index
);

/** The end-hour options: 10:00 through 24:00, so a slot always ends after it starts. */
const END_HOURS: number[] = Array.from(
  {length: END_OF_DAY_HOUR - (OPENING_HOUR + 1) + 1},
  (_, index) => OPENING_HOUR + 1 + index
);

/** The status options the resolve control offers, in the contract's order. */
const STATUS_OPTIONS: Array<{value: TSingleBookingStatus; label: string}> = (
  Object.keys(STATUS_LABELS) as TSingleBookingStatus[]
).map((value) => ({value, label: STATUS_LABELS[value]}));

/** One slot shaped for the detail table: the labels the template reads, and its index. */
interface ISlotRow {
  index: number;
  dayLabel: string;
  hoursLabel: string;
  statusLabel: string;
  status: TSingleBookingStatus;
  participants: number | undefined;
  comments: string | undefined;
  /** FR-018: a resolved slot's controls are not offered. */
  resolved: boolean;
  /** The wall-clock day, for the reschedule picker. */
  day: Date;
  startHour: number;
  endHour: number;
}

/** The wall-clock hour of an instant, 0–23, facility-local. */
const hourOf = (instant: Date): number => Number(formatFacilityTime(instant).slice(0, 2));

/** Shapes a booking's slots into the detail table's rows. */
const toSlotRows = (booking: IBooking): ISlotRow[] =>
  booking.bookedTimes.map((slot, index) => ({
    index,
    dayLabel: formatFacilityDate(new Date(slot.day)),
    hoursLabel: `${formatFacilityTime(new Date(slot.startHours))}–${formatFacilityTime(new Date(slot.endHours))}`,
    statusLabel: STATUS_LABELS[slot.status],
    status: slot.status,
    participants: slot.participants,
    comments: slot.comments,
    resolved: isResolved(slot),
    day: new Date(slot.day),
    startHour: hourOf(new Date(slot.startHours)),
    endHour: hourOf(new Date(slot.endHours)),
  }));

/**
 * Builds a slot's replacement from the editor's plain values.
 *
 * The day is the editor's civil date; the hours are wall-clock hours on that day. The
 * conversion goes through `atFacilityTime`, so the stored instants are facility-local and the
 * slot keeps its local time across a DST transition (R4).
 */
const buildSlot = (
  day: Date,
  startHour: number,
  endHour: number,
  status: TSingleBookingStatus,
  participants?: number,
  comments?: string
): IBookedTime => ({
  day: startOfFacilityDay(day),
  startHours: atFacilityTime(day, startHour),
  endHours: atFacilityTime(day, endHour),
  status,
  participants,
  comments,
});

export {
  FROM_THE_BEGINNING,
  BOOKING_COLUMNS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  CITY_LABELS,
  PAGE_SIZES,
  OPENING_HOUR,
  END_OF_DAY_HOUR,
  START_HOURS,
  END_HOURS,
  periodOptions,
  resolvePeriod,
  acceptedLabel,
  hasConflict,
  conflictLabel,
  slotLabel,
  slotsLabel,
  toRow,
  isResolved,
  replaceSlot,
  toSlotRows,
  buildSlot,
};
export type {IPeriodOption, IResolvedPeriod, ISlotRow};
