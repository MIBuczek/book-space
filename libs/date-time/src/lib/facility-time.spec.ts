import {
  addFacilityDays,
  atFacilityTime,
  endOfFacilityMonth,
  facilityDayNumber,
  facilityWallClock,
  formatFacilityDate,
  formatFacilityTime,
  instantFromLegacyLocal,
  isSameFacilityDay,
  startOfFacilityDay,
  startOfFacilityMonth,
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

  describe('formatFacilityDate / formatFacilityTime', () => {
    it('formats in the facility calendar, not UTC', () => {
      // 22:30Z in summer is 00:30 the next local day, so the date must roll over.
      expect(formatFacilityDate(new Date('2026-07-10T22:30:00Z'))).toBe('2026-07-11');
      expect(formatFacilityTime(new Date('2026-07-10T06:05:00Z'))).toBe('08:05');
      // Local midnight is 00:00, not 24:00 (`hourCycle: 'h23'`).
      expect(formatFacilityTime(new Date('2026-07-10T22:00:00Z'))).toBe('00:00');
    });

    it('zero-pads both fields', () => {
      expect(formatFacilityDate(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
      expect(formatFacilityTime(new Date('2026-01-05T07:00:00Z'))).toBe('08:00');
    });
  });

  describe('instantFromLegacyLocal (T055 migration reinterpretation)', () => {
    it('reads a legacy local-time string as a facility wall clock, not UTC', () => {
      // The legacy value "2026-07-15T08:00" is 08:00 local, which is 06:00Z in summer.
      expect(instantFromLegacyLocal('2026-07-15T08:00').toISOString()).toBe('2026-07-15T06:00:00.000Z');
      // The same wall clock in winter is 07:00Z — a fixed-offset parse would be wrong on one side.
      expect(instantFromLegacyLocal('2026-01-15T08:00').toISOString()).toBe('2026-01-15T07:00:00.000Z');
    });

    it('accepts a space separator and an optional seconds field', () => {
      expect(instantFromLegacyLocal('2026-07-15 08:30:15').toISOString()).toBe('2026-07-15T06:30:15.000Z');
      expect(instantFromLegacyLocal('2026-07-15T08:30').toISOString()).toBe('2026-07-15T06:30:00.000Z');
    });

    it('ignores a trailing zone designator, because the legacy strings are local', () => {
      // `overwriteDate` concatenated a local date and time and parsed it in the browser zone;
      // a stray `Z` is an artifact, not an offset, so the reading must be identical.
      expect(instantFromLegacyLocal('2026-07-15T08:00:00.000Z').toISOString()).toBe(
        instantFromLegacyLocal('2026-07-15T08:00').toISOString()
      );
    });

    it('maps a legacy value on a DST-transition day to the correct UTC instant', () => {
      // Spring-forward day: 08:00 local on 2026-03-29 is 06:00Z (offset already +2).
      expect(instantFromLegacyLocal('2026-03-29T08:00').toISOString()).toBe('2026-03-29T06:00:00.000Z');
      // Autumn fall-back day: 08:00 local on 2026-10-25 is 07:00Z, because the transition
      // happens at 03:00 local and the offset is +1 by the time 08:00 arrives.
      expect(instantFromLegacyLocal('2026-10-25T08:00').toISOString()).toBe('2026-10-25T07:00:00.000Z');
    });

    it('maps a legacy value inside the spring gap forward, and the autumn repeat to the later reading', () => {
      // 02:30 does not exist on the spring-forward day; it maps forward to 03:30 local (01:30Z).
      const gap = instantFromLegacyLocal('2026-03-29T02:30');
      expect(gap.toISOString()).toBe('2026-03-29T01:30:00.000Z');
      expect(facilityWallClock(gap)).toMatchObject({hour: 3, minute: 30});
      // 02:30 occurs twice on the fall-back day (00:30Z at +2, 01:30Z at +1); the later
      // occurrence — the post-transition offset — is chosen, which is what `instantFromWallClock`
      // documents and what `atFacilityTime` does for the same wall clock.
      expect(instantFromLegacyLocal('2026-10-25T02:30').toISOString()).toBe('2026-10-25T01:30:00.000Z');
      expect(instantFromLegacyLocal('2026-10-25T02:30').toISOString()).toBe(
        atFacilityTime(new Date('2026-10-25T00:00:00Z'), 2, 30).toISOString()
      );
    });

    it('throws for a value that is not a legacy local-time string', () => {
      expect(() => instantFromLegacyLocal('not-a-date')).toThrow(RangeError);
    });
  });

  describe('startOfFacilityMonth / endOfFacilityMonth', () => {
    it('brackets the facility-local month, not the UTC month', () => {
      // 22:30Z on the last day of June is 00:30 on 1 July locally, so the month is July.
      const start = startOfFacilityMonth(new Date('2026-06-30T22:30:00Z'));
      expect(start.toISOString()).toBe('2026-06-30T22:00:00.000Z');
      expect(formatFacilityDate(start)).toBe('2026-07-01');

      const end = endOfFacilityMonth(new Date('2026-06-30T22:30:00Z'));
      expect(formatFacilityDate(end)).toBe('2026-07-31');
      expect(facilityWallClock(end)).toMatchObject({hour: 23, minute: 59, second: 59});
    });

    it('handles month length and February without a table', () => {
      expect(formatFacilityDate(endOfFacilityMonth(new Date('2026-02-10T12:00:00Z')))).toBe('2026-02-28');
      expect(formatFacilityDate(endOfFacilityMonth(new Date('2028-02-10T12:00:00Z')))).toBe('2028-02-29');
      expect(formatFacilityDate(endOfFacilityMonth(new Date('2026-04-10T12:00:00Z')))).toBe('2026-04-30');
    });
  });
});
