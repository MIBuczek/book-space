import {academicYearRange, academicYearStartYear, currentAcademicYearRange} from './academic-year';

/**
 * The academic year is the default period for the staff booking list (FR-020, R9). The
 * two things that would silently serve the wrong records are the turn-over month and the
 * zone the boundaries are read in, so both are pinned here rather than inferred from a
 * request.
 */
describe('academic year', () => {
  describe('academicYearStartYear', () => {
    it('turns over in August, so 1 August belongs to the new year', () => {
      // The spec's edge case says "August or later". The legacy code switched in
      // September, a month late; this is the corrected boundary.
      expect(academicYearStartYear(new Date('2026-08-01T12:00:00+02:00'))).toBe(2026);
    });

    it('keeps 31 July in the previous year', () => {
      expect(academicYearStartYear(new Date('2026-07-31T12:00:00+02:00'))).toBe(2025);
    });

    it('keeps January in the year that began the previous August', () => {
      expect(academicYearStartYear(new Date('2027-01-15T12:00:00+01:00'))).toBe(2026);
    });

    it('reads the month in the facility zone, not UTC', () => {
      // 2026-07-31T23:30Z is 2026-08-01T01:30 in Warsaw, so it is already the new year.
      // A UTC reading would put it in the old one.
      expect(academicYearStartYear(new Date('2026-07-31T23:30:00Z'))).toBe(2026);
    });
  });

  describe('academicYearRange', () => {
    it('runs 1 August to the end of 31 August the following year', () => {
      const range = academicYearRange(2022);

      expect(range.label).toBe('2022/2023');
      expect(range.from.toISOString()).toBe('2022-07-31T22:00:00.000Z');
      // The last millisecond of 31 August local, so the range is inclusive on both ends.
      expect(range.to.toISOString()).toBe('2023-08-31T21:59:59.999Z');
    });

    it('places 1 August local midnight inside the period it names', () => {
      const range = academicYearRange(2026);
      const firstInstant = new Date('2026-08-01T00:00:00+02:00');

      expect(range.from.getTime()).toBeLessThanOrEqual(firstInstant.getTime());
      expect(range.to.getTime()).toBeGreaterThanOrEqual(firstInstant.getTime());
    });

    it('covers a date on the last day of the period', () => {
      const range = academicYearRange(2022);
      const lastInstant = new Date('2023-08-31T23:59:59+02:00');

      expect(range.to.getTime()).toBeGreaterThanOrEqual(lastInstant.getTime());
    });
  });

  describe('currentAcademicYearRange', () => {
    it('is the period containing the given instant', () => {
      expect(currentAcademicYearRange(new Date('2026-09-15T12:00:00+02:00')).label).toBe('2026/2027');
      expect(currentAcademicYearRange(new Date('2027-03-15T12:00:00+01:00')).label).toBe('2026/2027');
    });
  });
});
