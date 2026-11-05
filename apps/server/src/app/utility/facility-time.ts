/**
 * Facility time-zone arithmetic (research.md R4).
 *
 * The booking domain stores instants (UTC `Date`s) and thinks in the facility's
 * civil calendar: a "day" is a local calendar date and "08:00" is a local wall clock.
 * The legacy application did this by hand — adding one or two hours depending on a
 * `checkIfWinterTimeZone` guess and building strings by concatenation — which is the
 * source of its date defects (legacy issues #27, #58). This module is the single
 * place that converts between the two, so no caller re-derives an offset.
 *
 * `Europe/Warsaw` is the only zone; it is not configurable, because the facility is
 * single-tenant and a wrong zone would silently misplace every slot.
 *
 * All functions are pure. The conversion uses `Intl` rather than a date library:
 * Node 24 ships full ICU, so the zone database is available without a dependency,
 * and the two DST transitions are covered by `facility-time.spec.ts`.
 */

const FACILITY_TIME_ZONE = 'Europe/Warsaw';

const MS_PER_DAY = 86_400_000;

/** The civil calendar fields of an instant, as read in the facility's zone. */
interface IFacilityWallClock {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0–23. */
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FACILITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // `h23` gives 00–23; without it midnight formats as "24" and every day boundary is
  // off by one.
  hourCycle: 'h23',
});

/** The wall clock an instant shows in the facility's zone. */
const facilityWallClock = (instant: Date): IFacilityWallClock => {
  const parts: Record<string, string> = {};
  for (const {type, value} of partsFormatter.formatToParts(instant)) {
    parts[type] = value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

/**
 * The zone offset at an instant, in milliseconds (positive east of UTC).
 *
 * Derived by reading the instant back as a wall clock and treating those fields as
 * if they were UTC; the difference is the offset. This is the standard `Intl` trick
 * and is why the module needs no offset table.
 */
const zoneOffset = (instant: Date): number => {
  const wall = facilityWallClock(instant);
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asIfUtc - instant.getTime();
};

/**
 * The instant at which the facility's wall clock reads the given fields.
 *
 * The offset depends on the instant being resolved, so it is applied twice: once
 * with a UTC guess, then again with the offset measured at that guess. For the
 * ordinary case the second pass is a no-op. It does not disambiguate the repeated
 * hour of the autumn transition (the earlier of the two readings is returned) and it
 * maps a time inside the spring gap forward, which is the conventional behaviour and
 * is asserted in the spec.
 */
const instantFromWallClock = (wall: IFacilityWallClock): Date => {
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const firstGuess = new Date(asIfUtc - zoneOffset(new Date(asIfUtc)));
  return new Date(asIfUtc - zoneOffset(firstGuess));
};

/** The facility-local calendar date as a day count, for whole-day differences. */
const facilityDayNumber = (instant: Date): number => {
  const wall = facilityWallClock(instant);
  return Math.floor(Date.UTC(wall.year, wall.month - 1, wall.day) / MS_PER_DAY);
};

/** Whether two instants fall on the same facility-local calendar day. */
const isSameFacilityDay = (one: Date, other: Date): boolean => facilityDayNumber(one) === facilityDayNumber(other);

/**
 * The start of the facility-local day containing `instant` (local midnight).
 *
 * A stored `day` is always this instant, so two slots on the same local date carry
 * the same `day` — which is what conflict detection compares.
 */
const startOfFacilityDay = (instant: Date): Date => {
  const wall = facilityWallClock(instant);
  return instantFromWallClock({...wall, hour: 0, minute: 0, second: 0});
};

/** Shifts the wall clock by whole local days, keeping the time of day constant. */
const addFacilityDays = (instant: Date, days: number): Date => {
  const wall = facilityWallClock(instant);
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  date.setUTCDate(date.getUTCDate() + days);
  return instantFromWallClock({
    ...wall,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
};

/** The instant on `day`'s local date at the given wall-clock time. */
const atFacilityTime = (day: Date, hour: number, minute = 0, second = 0): Date => {
  const wall = facilityWallClock(day);
  return instantFromWallClock({...wall, hour, minute, second});
};

/**
 * The start of the facility-local calendar month containing `instant` (local midnight on the
 * 1st).
 *
 * Reporting ranges are months in the facility's calendar, not UTC, so a booking whose slot is
 * late on the last local day of a month belongs to that month even though its instant may be
 * in the next UTC month. The conversion is done through `instantFromWallClock` rather than
 * `Date.UTC` for the same reason the rest of this module exists.
 */
const startOfFacilityMonth = (instant: Date): Date => {
  const wall = facilityWallClock(instant);
  return instantFromWallClock({...wall, day: 1, hour: 0, minute: 0, second: 0});
};

/**
 * The last instant of the facility-local calendar month containing `instant` (23:59:59 on the
 * final local day). The legacy range was inclusive on both ends
 * (`changeDayInDateStart(1)` … `changeDayInDateEnd(numberOfMonthDays)`), so an inclusive upper
 * bound is what reproduces it; the second is `59` rather than `999`, matching the legacy
 * `setHours(23, 59, 59, 0)`.
 */
const endOfFacilityMonth = (instant: Date): Date => {
  const wall = facilityWallClock(instant);
  // Day 0 of the next month is the last day of this one, which handles month lengths and
  // February without a table.
  const lastDay = new Date(Date.UTC(wall.year, wall.month, 0)).getUTCDate();
  return instantFromWallClock({...wall, day: lastDay, hour: 23, minute: 59, second: 59});
};

export {
  FACILITY_TIME_ZONE,
  facilityWallClock,
  facilityDayNumber,
  isSameFacilityDay,
  startOfFacilityDay,
  startOfFacilityMonth,
  endOfFacilityMonth,
  addFacilityDays,
  atFacilityTime,
};
export type {IFacilityWallClock};
