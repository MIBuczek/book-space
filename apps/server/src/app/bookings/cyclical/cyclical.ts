import {IBookedTime} from '@models/booked-time.model';
import {addFacilityDays, atFacilityTime, facilityDayNumber, startOfFacilityDay} from '@booking/date-time';

/**
 * Cyclical booking expansion (FR-013, research.md R4).
 *
 * A cyclical booking repeats a single weekly slot. The legacy `bookingTimeCreator`
 * counted weeks as `Math.round((endDay - startDay) / 7 days)` and then ran a
 * `do/while` over `index <= weeksBetween`, so it emitted one occurrence too many for
 * every range that was not a whole number of weeks apart — the defect the issue
 * describes. This module replaces the count with a rule that can be stated in one
 * sentence and checked by eye:
 *
 *   Slots fall on `startDay` and every 7 days after it, and every slot day that is
 *   **not after** `endDay` is kept. Both endpoints are inclusive.
 *
 * Worked examples (all dates facility-local, all at 08:00):
 *
 * | startDay   | endDay     | days between | slots |
 * |------------|------------|--------------|-------|
 * | 2026-06-01 | 2026-06-01 | 0            | 1     |
 * | 2026-06-01 | 2026-06-07 | 6            | 1     |
 * | 2026-06-01 | 2026-06-08 | 7            | 2     |
 * | 2026-06-01 | 2026-06-28 | 27           | 4     |
 * | 2026-06-01 | 2026-06-29 | 28           | 5     |
 *
 * The count is therefore `floor(daysBetween / 7) + 1`. The end day is included when
 * it lands on the weekly boundary, which is why the 7-day row is 2 and not 1: a
 * range "inside one week" (0–6 days) is the one that yields a single slot.
 *
 * The slot's *time of day* is the caller's `startHour`/`endHour`, applied to each
 * occurrence through the facility-time utility, so a range that crosses a DST
 * transition keeps a constant local start hour rather than a constant UTC offset
 * (R4). `day` is the start of the facility-local day, which is what conflict
 * detection compares.
 */

const DAYS_PER_WEEK = 7;

interface ICyclicalExpansionRequest {
  /** First day of the series; any instant on that facility-local day. */
  startDay: Date;
  /** Last day of the series, inclusive; any instant on that facility-local day. */
  endDay: Date;
  /** Facility-local start hour, 0–23. */
  startHour: number;
  /** Facility-local end hour, 1–24. `24` means midnight at the end of the day. */
  endHour: number;
  /** When false, the series is the single `startDay` slot. */
  cyclical: boolean;
}

/**
 * Expands a booking request into its individual slots.
 *
 * Throws `RangeError` when `endDay` precedes `startDay`. The caller is expected to
 * reject that at the boundary; the function refuses it rather than silently
 * generating a backwards or empty series.
 */
const expandBookingTimes = ({
  startDay,
  endDay,
  startHour,
  endHour,
  cyclical,
}: ICyclicalExpansionRequest): IBookedTime[] => {
  const first = startOfFacilityDay(startDay);
  const last = startOfFacilityDay(endDay);

  if (last.getTime() < first.getTime()) {
    throw new RangeError('endDay must not be earlier than startDay');
  }

  const daysBetween = facilityDayNumber(last) - facilityDayNumber(first);
  const weekCount = cyclical ? Math.floor(daysBetween / DAYS_PER_WEEK) : 0;

  const slots: IBookedTime[] = [];
  for (let week = 0; week <= weekCount; week += 1) {
    const day = addFacilityDays(first, week * DAYS_PER_WEEK);
    slots.push({
      day,
      startHours: atFacilityTime(day, startHour),
      endHours: atFacilityTime(day, endHour),
      status: 'INITIAL',
    });
  }

  return slots;
};

export {expandBookingTimes, DAYS_PER_WEEK};
export type {ICyclicalExpansionRequest};
