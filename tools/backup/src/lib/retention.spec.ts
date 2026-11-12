import {retentionCutoff, lastSlotDay, isPurgeable, purgeFilter, DEFAULT_RETENTION_MONTHS} from './retention';

/**
 * The retention rule's boundary cases (T060, spec.md §9 open question 7).
 *
 * The rule is pure and takes its cutoff as a value, so every case here pins a date rather than
 * depending on the clock. The two boundaries that matter are the ones an off-by-one would move:
 * a booking whose last slot is *exactly* the cutoff, and a booking that is not archived.
 */

const cutoff = (iso: string): Date => new Date(iso);

describe('retentionCutoff', () => {
  it('subtracts whole calendar months, not a fixed number of days', () => {
    // A calendar subtraction is what the boundary must follow: 2026-11-08 minus eleven months is
    // 2025-12-08, which 11*30 days would miss.
    expect(retentionCutoff(new Date('2026-11-08T12:00:00.000Z'), 11).toISOString()).toBe(
      '2025-12-08T12:00:00.000Z'
    );
  });

  it('rolls a short month forward, matching the calendar', () => {
    // 31 Jan minus one month has no 31 Feb, so JavaScript rolls to 3 Mar (2026 is not a leap
    // year). The rule is documented against this, not left to be discovered.
    expect(retentionCutoff(new Date('2026-01-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2025-12-31T12:00:00.000Z'
    );
    expect(retentionCutoff(new Date('2026-03-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-03-03T12:00:00.000Z'
    );
  });

  it('rolls a leap day forward, matching the calendar', () => {
    // 29 Feb minus a whole number of months lands on a month with a 29th here, so it is clean;
    // the rollover case is the short-month one above.
    expect(retentionCutoff(new Date('2024-02-29T12:00:00.000Z'), 11).toISOString()).toBe(
      '2023-03-29T12:00:00.000Z'
    );
  });

  it('keeps the time of day', () => {
    expect(retentionCutoff(new Date('2026-11-08T17:51:00.000Z'), 11).toISOString()).toBe(
      '2025-12-08T17:51:00.000Z'
    );
  });

  it('defaults to eleven months', () => {
    expect(DEFAULT_RETENTION_MONTHS).toBe(11);
  });
});

describe('lastSlotDay', () => {
  it('returns the latest slot day, not the first', () => {
    const booking = {
      bookedTimes: [
        {day: new Date('2020-01-01T00:00:00.000Z')},
        {day: new Date('2020-03-01T00:00:00.000Z')},
        {day: new Date('2020-02-01T00:00:00.000Z')},
      ],
    };
    expect(lastSlotDay(booking)?.toISOString()).toBe('2020-03-01T00:00:00.000Z');
  });

  it('accepts string days from a relaxed archive', () => {
    expect(lastSlotDay({bookedTimes: [{day: '2020-03-01T00:00:00.000Z'}]})?.toISOString()).toBe(
      '2020-03-01T00:00:00.000Z'
    );
  });

  it('is null for a booking with no slots', () => {
    expect(lastSlotDay({})).toBeNull();
    expect(lastSlotDay({bookedTimes: []})).toBeNull();
  });

  it('ignores a slot with no day and an unparseable day', () => {
    const booking = {
      bookedTimes: [
        {day: undefined},
        {day: new Date('not-a-date')},
        {day: new Date('2020-05-05T00:00:00.000Z')},
      ],
    };
    expect(lastSlotDay(booking)?.toISOString()).toBe('2020-05-05T00:00:00.000Z');
  });

  it('is null when every slot day is unusable', () => {
    expect(lastSlotDay({bookedTimes: [{day: new Date('nope')}]})).toBeNull();
  });
});

describe('isPurgeable', () => {
  const archived = (day: string) => ({archive: true, bookedTimes: [{day: new Date(day)}]});

  it('purges an archived booking whose last slot is before the cutoff', () => {
    expect(isPurgeable(archived('2020-01-01T00:00:00.000Z'), cutoff('2021-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('keeps a booking whose last slot is exactly the cutoff (strict boundary)', () => {
    expect(isPurgeable(archived('2021-01-01T00:00:00.000Z'), cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('keeps a booking whose last slot is after the cutoff', () => {
    expect(isPurgeable(archived('2021-06-01T00:00:00.000Z'), cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('never purges an unarchived booking, however old', () => {
    expect(isPurgeable({archive: false, bookedTimes: [{day: new Date('2000-01-01T00:00:00.000Z')}]}, cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('never purges a booking whose archive flag is absent', () => {
    expect(isPurgeable({bookedTimes: [{day: new Date('2000-01-01T00:00:00.000Z')}]}, cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('never purges an archived booking with no slots', () => {
    expect(isPurgeable({archive: true, bookedTimes: []}, cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
    expect(isPurgeable({archive: true}, cutoff('2021-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('purgeFilter', () => {
  it('scopes to archived bookings with a slot before the cutoff', () => {
    const filter = purgeFilter(cutoff('2021-01-01T00:00:00.000Z'));
    expect(filter).toEqual({
      archive: true,
      'bookedTimes.0': {$exists: true},
      bookedTimes: {$not: {$elemMatch: {day: {$gte: cutoff('2021-01-01T00:00:00.000Z')}}}},
    });
  });
});
