import {facilityWallClock, startOfFacilityDay} from './facility-time';

/**
 * Academic-year periods for the booking list and the public calendar (FR-020, research.md R9).
 *
 * The legacy application offered a period picker (`generateBookingDateOptions`) whose
 * periods were `1 August Y` → `31 August Y+1`, for years from 2022, plus an
 * "Od początku" (from the beginning) entry. This module reproduces the *period* shape
 * and derives the current one; the option list itself is the UI's to build.
 *
 * The boundaries are facility-local midnights (R4), not UTC: a booking created at
 * 00:30 on 1 August belongs to the year that starts that day, and a UTC boundary would
 * place it in the previous year. `startOfFacilityDay` is the single conversion, so this
 * module does not re-derive an offset.
 *
 * A period's `to` is the last millisecond of 31 August, so the range is inclusive on
 * both ends and "1 Aug – 31 Aug" means exactly those two days. A half-open range would
 * have been one instant easier to build and much easier to misread.
 *
 * The month the year turns over is **August**, per the spec's edge case ("extended by
 * one year when the current month is August or later"). The legacy code switched in
 * September (`currentMonth >= 8` in `generateBookingDateOptions`), a month late, which
 * is a defect the rewrite corrects rather than reproduces.
 */

/** Facility-local midnight on a calendar date. */
const facilityMidnight = (year: number, month: number, day: number): Date =>
  // Noon UTC lands on the same facility-local date for any offset the facility can
  // have, so reading it back gives that date's local midnight without an offset table.
  startOfFacilityDay(new Date(Date.UTC(year, month - 1, day, 12)));

interface IAcademicYearRange {
  /** Inclusive start, facility-local midnight on 1 August. */
  from: Date;
  /** Inclusive end, the last millisecond of 31 August the following year. */
  to: Date;
  /** The legacy label, `Y/Y+1`. */
  label: string;
}

/**
 * The start year of the academic year containing `now`.
 *
 * August–December belong to the year that begins that August; January–July belong to
 * the year that began the previous August.
 */
const academicYearStartYear = (now: Date): number => {
  const {year, month} = facilityWallClock(now);
  return month >= 8 ? year : year - 1;
};

/** The period that starts in `startYear`. */
const academicYearRange = (startYear: number): IAcademicYearRange => ({
  from: facilityMidnight(startYear, 8, 1),
  to: new Date(facilityMidnight(startYear + 1, 9, 1).getTime() - 1),
  label: `${startYear}/${startYear + 1}`,
});

/** The academic year containing `now`, which is the default period for staff. */
const currentAcademicYearRange = (now: Date): IAcademicYearRange => academicYearRange(academicYearStartYear(now));

export {academicYearStartYear, academicYearRange, currentAcademicYearRange};
export type {IAcademicYearRange};
