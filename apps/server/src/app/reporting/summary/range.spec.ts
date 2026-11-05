import {resolveSummaryRange} from './range';

/**
 * The range is the one piece of calendar arithmetic in the report. It is asserted against
 * real instants, including a month whose local boundaries are not the UTC ones, because the
 * legacy window was built from local `Date` setters and a UTC implementation would move a
 * late-evening slot across a month boundary.
 */
describe('resolveSummaryRange', () => {
  it('widens a month to its whole local month, inclusive on both ends', () => {
    const range = resolveSummaryRange(new Date('2026-03-15T12:00:00Z'), new Date('2026-03-20T12:00:00Z'), false);

    // March is CET (+1): local 1 March 00:00 is 2026-02-28T23:00Z.
    expect(range.from?.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    // Local 31 March 23:59:59 is 2026-03-31T21:59:59Z (+2, CEST).
    expect(range.to?.toISOString()).toBe('2026-03-31T21:59:59.000Z');
  });

  it('takes the last day of a short month', () => {
    const range = resolveSummaryRange(new Date('2026-02-10T12:00:00Z'), new Date('2026-02-10T12:00:00Z'), false);
    // February 2026 has 28 days; local 28 Feb 23:59:59 is 2026-02-28T22:59:59Z (+1).
    expect(range.to?.toISOString()).toBe('2026-02-28T22:59:59.000Z');
  });

  it('returns an open range when fromTheBeginning is set, ignoring the bounds', () => {
    const range = resolveSummaryRange(undefined, undefined, true);
    expect(range).toEqual({fromTheBeginning: true});
  });

  it('rejects a range with only one bound', () => {
    expect(() => resolveSummaryRange(new Date('2026-03-01T00:00:00Z'), undefined, false)).toThrow(RangeError);
    expect(() => resolveSummaryRange(undefined, new Date('2026-03-01T00:00:00Z'), false)).toThrow(RangeError);
  });

  it('rejects an inverted range', () => {
    expect(() =>
      resolveSummaryRange(new Date('2026-04-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'), false)
    ).toThrow(RangeError);
  });
});
