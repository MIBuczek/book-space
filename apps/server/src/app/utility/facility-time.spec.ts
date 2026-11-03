import {
  addFacilityDays,
  atFacilityTime,
  facilityDayNumber,
  facilityWallClock,
  isSameFacilityDay,
  startOfFacilityDay,
} from './facility-time';

/**
 * The utility is the single place the application converts between instants and the
 * facility's civil calendar (research.md R4). Both DST transitions are asserted here,
 * because a rewrite that assumes a fixed +1 offset is correct for most of the year
 * and wrong for the two weeks either side of each transition.
 */
describe('facility-time', () => {
  it('reads the wall clock in Europe/Warsaw, not UTC', () => {
    // January is CET (+1): 00:00Z is 01:00 local.
    expect(facilityWallClock(new Date('2026-01-15T00:00:00Z'))).toMatchObject({hour: 1, day: 15, month: 1});

    // July is CEST (+2): 00:00Z is 02:00 local.
    expect(facilityWallClock(new Date('2026-07-15T00:00:00Z'))).toMatchObject({hour: 2, day: 15, month: 7});
  });

  it('uses hour 00 at local midnight rather than 24', () => {
    // `hourCycle: 'h23'` is what makes this 0; the default 12-hour cycle reports 24
    // and every "is it the same day" comparison shifts by one.
    expect(facilityWallClock(new Date('2026-03-28T23:00:00Z'))).toMatchObject({hour: 0, day: 29});
  });

  describe('spring-forward (2026-03-29, 02:00 → 03:00 local)', () => {
    it('starts the local day at 01:00Z, when the offset is still +1', () => {
      expect(startOfFacilityDay(new Date('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    });

    it('starts the next local day at 22:00Z, after the offset moved to +2', () => {
      // Local midnight on 2026-03-30 is 22:00Z on 2026-03-29 — one hour earlier than a
      // fixed-offset implementation would place it.
      expect(startOfFacilityDay(new Date('2026-03-30T12:00:00Z')).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    });
  });

  describe('fall-back (2026-10-25, 03:00 → 02:00 local)', () => {
    it('starts the local day at 22:00Z the previous evening, offset +2', () => {
      expect(startOfFacilityDay(new Date('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    });

    it('starts the next local day at 23:00Z, offset back to +1', () => {
      expect(startOfFacilityDay(new Date('2026-10-26T12:00:00Z')).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    });
  });

  describe('atFacilityTime', () => {
    it('returns the same wall clock it was asked for, in summer and winter', () => {
      const summer = atFacilityTime(new Date('2026-07-15T00:00:00Z'), 8);
      const winter = atFacilityTime(new Date('2026-01-15T00:00:00Z'), 8);

      expect(facilityWallClock(summer)).toMatchObject({hour: 8, day: 15, month: 7});
      expect(facilityWallClock(winter)).toMatchObject({hour: 8, day: 15, month: 1});
      // The instants differ by an hour even though the wall clock is identical, which
      // is the whole point of converting through the zone.
      expect(summer.toISOString()).toBe('2026-07-15T06:00:00.000Z');
      expect(winter.toISOString()).toBe('2026-01-15T07:00:00.000Z');
    });

    it('maps hour 24 to midnight at the end of the day', () => {
      const end = atFacilityTime(new Date('2026-07-15T00:00:00Z'), 24);

      expect(facilityWallClock(end)).toMatchObject({hour: 0, day: 16, month: 7});
    });
  });

  describe('addFacilityDays', () => {
    it('keeps the wall-clock hour constant across the spring transition', () => {
      // 08:00 on the Saturday before the change, plus one day, is 08:00 on the Sunday
      // after it — the local hour is preserved even though the UTC instant moved by
      // only 23 hours.
      const before = atFacilityTime(new Date('2026-03-28T00:00:00Z'), 8);
      const after = addFacilityDays(before, 1);

      expect(facilityWallClock(before)).toMatchObject({hour: 8, day: 28, month: 3});
      expect(facilityWallClock(after)).toMatchObject({hour: 8, day: 29, month: 3});
      expect(after.getTime() - before.getTime()).toBe(23 * 3_600_000);
    });

    it('keeps the wall-clock hour constant across the autumn transition', () => {
      const before = atFacilityTime(new Date('2026-10-24T00:00:00Z'), 8);
      const after = addFacilityDays(before, 1);

      expect(facilityWallClock(after)).toMatchObject({hour: 8, day: 25, month: 10});
      expect(after.getTime() - before.getTime()).toBe(25 * 3_600_000);
    });

    it('advances by whole local days across a year boundary', () => {
      const before = atFacilityTime(new Date('2026-12-31T00:00:00Z'), 8);
      const after = addFacilityDays(before, 1);

      expect(facilityWallClock(after)).toMatchObject({year: 2027, month: 1, day: 1, hour: 8});
    });
  });

  describe('isSameFacilityDay', () => {
    it('is true for two instants on the same local date, whatever the UTC date', () => {
      // 00:00 local on 2026-03-29 is 23:00Z on 2026-03-28; 08:00 local the same date
      // is 06:00Z on 2026-03-29. The UTC dates differ, the facility-local dates do not.
      const lateEvening = new Date('2026-03-28T23:00:00Z'); // 2026-03-29T00:00 local
      const earlyMorning = new Date('2026-03-29T06:00:00Z'); // 2026-03-29T08:00 local

      expect(isSameFacilityDay(lateEvening, earlyMorning)).toBe(true);
    });

    it('is false across a local midnight', () => {
      const beforeMidnight = new Date('2026-03-28T22:30:00Z'); // 2026-03-28T23:30 local
      const afterMidnight = new Date('2026-03-28T23:30:00Z'); // 2026-03-29T00:30 local

      expect(isSameFacilityDay(beforeMidnight, afterMidnight)).toBe(false);
    });

    it('agrees with facilityDayNumber', () => {
      const day = atFacilityTime(new Date('2026-07-15T00:00:00Z'), 8);

      expect(facilityDayNumber(day)).toBe(facilityDayNumber(startOfFacilityDay(day)));
    });
  });
});
