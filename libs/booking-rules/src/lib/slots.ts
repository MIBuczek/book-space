/**
 * The slot-overlap predicate (FR-012, FR-015, research.md R5).
 *
 * A pure reimplementation of the legacy `checkSingleBookingTime`
 * (`check-booking-conflicts-function.ts`), with the same semantics:
 *
 * - Two slots conflict when they are on the same day **and** their hour ranges overlap.
 * - Overlap is any of: one range's start or end falls *strictly* inside the other, or one
 *   range fully contains the other.
 * - "Strictly inside" and "contains" together are what makes a touching interval
 *   (`end === next start`) a non-conflict: a range that merely ends where another begins is
 *   neither strictly inside it nor containing it.
 *
 * The predicate lives in this shared library rather than in the server because both sides
 * of the contract need the same answer: the server refuses a double booking (FR-015) and
 * the booking form warns about a conflict between the slots a visitor is entering
 * (FR-012). The legacy application had the browser rule in
 * `check-booking-conflicts-function.ts` and no server rule at all, so the two could not
 * disagree — here they would if each kept its own copy, which is what the constitution's
 * single-source principle forbids.
 *
 * The rule is stated over the slots' days, not over a booking's stored `month` (T054). The
 * legacy implementation gated the comparison on `currentBooking.month === b.month`, where
 * `month` is derived from the **first** slot, so a booking whose slots straddle a month
 * boundary carried a single scalar and its later slot was never compared against the month
 * it crossed into. Two slots can only overlap when they share a day, so the day comparison
 * subsumes the month gate everywhere the gate was correct and removes it where it was wrong.
 */

/** A single slot, as overlap detection reads it. */
interface IConflictSlot {
  day: Date;
  startHours: Date;
  endHours: Date;
}

const toMillis = (value: Date): number => new Date(value).getTime();

/**
 * Whether two slots are on the same day.
 *
 * The legacy `checkDay` compared the two instants for exact equality
 * (`Date.parse(a.toISOString()) - Date.parse(b.toISOString()) === 0`), and the rewrite
 * keeps that: `day` is stored as the calendar day with a zero time, so two slots on the
 * same day carry the same instant. A "same calendar day in local time" test would be a
 * *different* rule — it would additionally call two slots on the same date at different
 * times-of-day the same day — and re-implementing it here would diverge from the reference
 * the SC-002 criterion compares against. The slot's *time of day* lives in
 * `startHours`/`endHours`, not in `day`.
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
 * The three cases are not mutually exclusive and are evaluated with the same short-circuit
 * order as the legacy `checkSingleBookingTime`.
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

export {isSameDay, isStrictlyInside, contains, slotsConflict};
export type {IConflictSlot};
