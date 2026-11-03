import {facilityDayNumber, facilityWallClock, startOfFacilityDay} from '../../utility/facility-time';
import {expandBookingTimes} from './cyclical';

/**
 * The rule under test is: slots fall on `startDay` and every 7 days after it, and
 * every slot day not after `endDay` is kept. Both endpoints are inclusive, so a
 * whole-week range includes its end day and a sub-week range is a single slot.
 *
 * The last suite contrasts this with the legacy count, so the corrected week
 * calculation is pinned rather than merely asserted to be "some number".
 */

const day = (iso: string): Date => startOfFacilityDay(new Date(iso));

/** A booking on the given local day at 08:00–09:00. */
const weekly = (start: string, end: string) =>
  expandBookingTimes({
    startDay: day(`${start}T12:00:00Z`),
    endDay: day(`${end}T12:00:00Z`),
    startHour: 8,
    endHour: 9,
    cyclical: true,
  });

describe('expandBookingTimes', () => {
  describe('week counting', () => {
    it('produces exactly one slot for a single day', () => {
      expect(weekly('2026-06-01', '2026-06-01')).toHaveLength(1);
    });

    it('produces exactly one slot for a range inside one week', () => {
      // Six days apart is not a weekly repeat, so there is one occurrence.
      expect(weekly('2026-06-01', '2026-06-07')).toHaveLength(1);
    });

    it('produces exactly two slots for a one-week range', () => {
      // Seven days apart lands on the weekly boundary, and the end day is inclusive.
      expect(weekly('2026-06-01', '2026-06-08')).toHaveLength(2);
    });

    it('produces exactly four slots for a four-week range', () => {
      // The acceptance criterion: a four-week range produces exactly four.
      expect(weekly('2026-06-01', '2026-06-22')).toHaveLength(4);
    });

    it('produces five slots when the end day is one day past four weeks', () => {
      expect(weekly('2026-06-01', '2026-06-29')).toHaveLength(5);
    });

    it('places the slots exactly seven days apart', () => {
      const slots = weekly('2026-06-01', '2026-06-22');

      expect(slots.map((slot) => facilityWallClock(slot.day).day)).toEqual([1, 8, 15, 22]);
      for (let index = 1; index < slots.length; index += 1) {
        expect(facilityDayNumber(slots[index].day) - facilityDayNumber(slots[index - 1].day)).toBe(7);
      }
    });

    it('returns a single slot when cyclical is false, whatever the range', () => {
      const slots = expandBookingTimes({
        startDay: day('2026-06-01T12:00:00Z'),
        endDay: day('2026-08-01T12:00:00Z'),
        startHour: 8,
        endHour: 9,
        cyclical: false,
      });

      expect(slots).toHaveLength(1);
      expect(facilityWallClock(slots[0].day)).toMatchObject({month: 6, day: 1});
    });
  });

  describe('DST', () => {
    it('keeps a constant local start hour across the spring transition', () => {
      // 2026-03-29 is the spring-forward day in Europe/Warsaw.
      const slots = weekly('2026-03-22', '2026-04-05');

      expect(slots.length).toBeGreaterThanOrEqual(3);
      for (const slot of slots) {
        expect(facilityWallClock(slot.startHours).hour).toBe(8);
      }
      // The local hour is constant but the UTC instants are not: before the change
      // 08:00 is 07:00Z, after it is 06:00Z.
      expect(slots[0].startHours.toISOString()).toBe('2026-03-22T07:00:00.000Z');
      expect(slots[1].startHours.toISOString()).toBe('2026-03-29T06:00:00.000Z');
    });

    it('keeps a constant local start hour across the autumn transition', () => {
      const slots = weekly('2026-10-18', '2026-11-01');

      for (const slot of slots) {
        expect(facilityWallClock(slot.startHours).hour).toBe(8);
      }
      expect(slots[0].startHours.toISOString()).toBe('2026-10-18T06:00:00.000Z');
      expect(slots[1].startHours.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    });
  });

  describe('year boundary', () => {
    it('produces the correct number of slots across New Year', () => {
      // 2026-12-21 is a Monday; 2027-01-11 is three weeks later, so four slots.
      const slots = weekly('2026-12-21', '2027-01-11');

      expect(slots).toHaveLength(4);
      expect(slots.map((slot) => facilityWallClock(slot.day)).map(({year, month, day: d}) => `${year}-${month}-${d}`)).toEqual([
        '2026-12-21',
        '2026-12-28',
        '2027-1-4',
        '2027-1-11',
      ]);
    });

    it('keeps the local start hour across the year boundary', () => {
      const slots = weekly('2026-12-28', '2027-01-04');

      for (const slot of slots) {
        expect(facilityWallClock(slot.startHours).hour).toBe(8);
      }
    });
  });

  describe('slot shape', () => {
    it('starts every slot in the INITIAL status', () => {
      const slots = weekly('2026-06-01', '2026-06-08');

      expect(slots.map((slot) => slot.status)).toEqual(['INITIAL', 'INITIAL']);
    });

    it('uses the local day start for day, so same-day slots compare equal', () => {
      const [slot] = weekly('2026-06-01', '2026-06-01');

      expect(slot.day.toISOString()).toBe(startOfFacilityDay(new Date('2026-06-01T12:00:00Z')).toISOString());
    });

    it('ends at local midnight when endHour is 24', () => {
      const [slot] = expandBookingTimes({
        startDay: day('2026-06-01T12:00:00Z'),
        endDay: day('2026-06-01T12:00:00Z'),
        startHour: 22,
        endHour: 24,
        cyclical: false,
      });

      expect(facilityWallClock(slot.startHours)).toMatchObject({hour: 22, day: 1});
      expect(facilityWallClock(slot.endHours)).toMatchObject({hour: 0, day: 2});
    });
  });

  describe('invalid ranges', () => {
    it('rejects an end day earlier than the start day', () => {
      expect(() => weekly('2026-06-08', '2026-06-01')).toThrow(RangeError);
    });

    it('treats two instants on the same local day as a single-day range', () => {
      // The range is compared by local date, so the time of day on the endpoints is
      // irrelevant.
      const slots = expandBookingTimes({
        startDay: new Date('2026-06-01T05:00:00Z'),
        endDay: new Date('2026-06-01T20:00:00Z'),
        startHour: 8,
        endHour: 9,
        cyclical: true,
      });

      expect(slots).toHaveLength(1);
    });
  });

  describe('contrast with the legacy week count', () => {
    /**
     * The legacy generator: a `do/while` over `index <= round(days/7)`, starting at
     * index 1 with the start-day slot already emitted. Transcribed so the difference
     * is a failing assertion rather than a claim in a comment.
     */
    const legacySlotCount = (startIso: string, endIso: string): number => {
      const start = new Date(`${startIso}T00:00:00Z`).getTime();
      const end = new Date(`${endIso}T00:00:00Z`).getTime();
      const weeksBetween = Math.round((end - start) / (7 * 24 * 60 * 60 * 1000));
      let count = 1;
      let index = 1;
      do {
        count += 1;
        index += 1;
      } while (index <= weeksBetween);
      return count;
    };

    it('agrees with the legacy count on whole-week ranges', () => {
      // A four-week range: the legacy count is 4 and so is the rewrite's.
      expect(legacySlotCount('2026-06-01', '2026-06-22')).toBe(4);
      expect(weekly('2026-06-01', '2026-06-22')).toHaveLength(4);
    });

    it('generates one fewer slot than the legacy count for a sub-week range', () => {
      // This is the off-by-one the issue names: the legacy do/while emits a second
      // occurrence for a six-day range that has no second weekly slot.
      expect(legacySlotCount('2026-06-01', '2026-06-07')).toBe(2);
      expect(weekly('2026-06-01', '2026-06-07')).toHaveLength(1);
    });
  });
});
