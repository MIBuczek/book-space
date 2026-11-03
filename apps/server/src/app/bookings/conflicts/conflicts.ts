/**
 * Booking conflict detection (FR-015, research.md R5).
 *
 * A pure, dependency-free reimplementation of the legacy
 * `check-booking-conflicts-function.ts`, with the same semantics, so the server can
 * refuse a double booking without trusting the browser. The legacy rules:
 *
 * - Two slots conflict when they are on the same day **and** their hour ranges
 *   overlap.
 * - Overlap is any of: one range's start or end falls *strictly* inside the other,
 *   or one range fully contains the other.
 * - A booking participates only when it is **not** accepted, and only against a
 *   booking in the same `month`.
 * - `findConflictingBookingIds` returns the distinct ids of the unaccepted bookings
 *   that conflict with at least one other.
 *
 * This module is deliberately free of Nest and Mongoose, so `conflicts.spec.ts` can
 * drive it directly and compare it against a transcription of the legacy algorithm
 * (SC-002).
 */

/** A single slot, as conflict detection reads it. */
interface IConflictSlot {
  day: Date;
  startHours: Date;
  endHours: Date;
}

/** A booking, as conflict detection reads it. */
interface IConflictBooking {
  _id: string;
  month: number;
  accepted: boolean;
  bookedTimes: IConflictSlot[];
}

const toMillis = (value: Date): number => new Date(value).getTime();

/**
 * Whether two slots are on the same day.
 *
 * The legacy `checkDay` compared the two instants for exact equality
 * (`Date.parse(a.toISOString()) - Date.parse(b.toISOString()) === 0`), and the
 * rewrite keeps that: `day` is stored as the calendar day with a zero time, so two
 * slots on the same day carry the same instant. A "same calendar day in local time"
 * test would be a *different* rule — it would additionally call two slots on the same
 * date at different times-of-day the same day — and re-implementing it here would
 * diverge from the reference the criterion compares against. The slot's *time of day*
 * lives in `startHours`/`endHours`, not in `day`.
 */
const isSameDay = (one: Date, two: Date): boolean => toMillis(one) === toMillis(two);

/** Whether `instant` is strictly between `startHour` and `endHour`. */
const isStrictlyInside = (instant: Date, startHour: Date, endHour: Date): boolean => {
  const at = toMillis(instant);
  return at > toMillis(startHour) && at < toMillis(endHour);
};

/** Whether `[outerStart, outerEnd]` contains `[innerStart, innerEnd]`, ends inclusive. */
const contains = (outerStart: Date, outerEnd: Date, innerStart: Date, innerEnd: Date): boolean =>
  toMillis(outerStart) <= toMillis(innerStart) && toMillis(outerEnd) >= toMillis(innerEnd);

/**
 * Whether two slots conflict.
 *
 * The three cases are not mutually exclusive and are evaluated with the same
 * short-circuit order as the legacy `checkSingleBookingTime`. "Strictly inside" and
 * "contains" together are what makes a touching interval a non-conflict: a range that
 * merely ends where another begins is neither strictly inside it nor containing it.
 */
const slotsConflict = (slot: IConflictSlot, other: IConflictSlot): boolean => {
  if (!isSameDay(slot.day, other.day)) {
    return false;
  }
  return (
    isStrictlyInside(slot.startHours, other.startHours, other.endHours) ||
    isStrictlyInside(slot.endHours, other.startHours, other.endHours) ||
    contains(slot.startHours, slot.endHours, other.startHours, other.endHours)
  );
};

/**
 * Whether two bookings conflict: different records, same month, and at least one
 * conflicting slot pair.
 *
 * The month is compared as the legacy did — exact equality of the 0–11 index — which
 * is why a conflict query is scoped to one month and a booking in March is never
 * compared against one in April even when the days overlap.
 */
const bookingsConflict = (current: IConflictBooking, other: IConflictBooking): boolean =>
  current._id !== other._id &&
  current.month === other.month &&
  other.bookedTimes.some((otherSlot) => current.bookedTimes.some((slot) => slotsConflict(slot, otherSlot)));

/**
 * The distinct ids of the unaccepted bookings that conflict with at least one other
 * booking in the list.
 *
 * The result is de-duplicated and ordered by first appearance, matching the legacy
 * `uniq`. The function compares every booking against every other, which is
 * quadratic; at the scale the spec states (hundreds of bookings per facility-month)
 * that is a few tens of thousands of slot comparisons, well inside the 2 s goal, and
 * an interval tree would be harder to prove equivalent to the reference (R5).
 */
const findConflictingBookingIds = (bookings: IConflictBooking[]): string[] => {
  const conflicted = new Set<string>();

  for (const current of bookings) {
    if (current.accepted) {
      continue;
    }
    if (bookings.some((other) => bookingsConflict(current, other))) {
      conflicted.add(current._id);
    }
  }

  return [...conflicted];
};

/**
 * The ids of the bookings that conflict with `target` (FR-015, FR-017).
 *
 * This is the approval-time question, which is narrower than the facility-month
 * counter `findConflictingBookingIds` answers: an administrator is about to accept
 * *this* booking, so only the bookings that overlap *it* matter.
 *
 * `target` is compared against `others` regardless of its own `accepted` flag,
 * because the decision is being made about it right now — the flag still holds its
 * previous value. Every *other* booking is considered, accepted or not: an approved
 * booking is exactly the one that cannot be double-booked. `findConflictingBookingIds`
 * excludes accepted bookings on both sides, which is correct for the counter and
 * wrong here, so this is a separate function rather than a flag on that one.
 */
const findConflictsWith = (target: IConflictBooking, others: IConflictBooking[]): string[] => {
  const conflicted = new Set<string>();

  for (const other of others) {
    if (other._id !== target._id && bookingsConflict(target, other)) {
      conflicted.add(other._id);
    }
  }

  return [...conflicted];
};

export {findConflictingBookingIds, findConflictsWith, slotsConflict, bookingsConflict};
export type {IConflictBooking, IConflictSlot};
