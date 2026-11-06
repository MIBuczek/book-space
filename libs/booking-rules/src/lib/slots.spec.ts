import {contains, isSameDay, isStrictlyInside, slotsConflict} from './slots';

/**
 * The overlap predicate (FR-012, FR-015).
 *
 * The cases mirror the legacy `checkSingleBookingTime` so the shared rule is pinned against
 * the reference the SC-002 criterion names: a touching interval is not a conflict, and both
 * the "one end strictly inside" and the "one range contains the other" shapes are.
 */

const DAY = new Date('2026-03-04T00:00:00.000Z');
const OTHER_DAY = new Date('2026-03-05T00:00:00.000Z');

const slot = (day: Date, start: string, end: string) => ({
  day,
  startHours: new Date(start),
  endHours: new Date(end),
});

describe('slotsConflict', () => {
  it('does not conflict when the slots are on different days', () => {
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'),
        slot(OTHER_DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')
      )
    ).toBe(false);
  });

  it('does not conflict when a slot merely touches another', () => {
    // `end === next start` is back-to-back, not an overlap.
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'),
        slot(DAY, '2026-03-04T09:00:00Z', '2026-03-04T10:00:00Z')
      )
    ).toBe(false);
  });

  it('conflicts when a slot starts strictly inside another', () => {
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T08:30:00Z', '2026-03-04T10:00:00Z'),
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')
      )
    ).toBe(true);
  });

  it('conflicts when a slot ends strictly inside another', () => {
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T07:30:00Z', '2026-03-04T08:30:00Z'),
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')
      )
    ).toBe(true);
  });

  it('conflicts when a slot contains another', () => {
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T07:00:00Z', '2026-03-04T12:00:00Z'),
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')
      )
    ).toBe(true);
  });

  it('conflicts when a slot is contained by another', () => {
    expect(
      slotsConflict(
        slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'),
        slot(DAY, '2026-03-04T07:00:00Z', '2026-03-04T12:00:00Z')
      )
    ).toBe(true);
  });
});

describe('isSameDay', () => {
  it('compares the instants exactly, as the legacy checkDay did', () => {
    expect(isSameDay(DAY, new Date(DAY.getTime()))).toBe(true);
    expect(isSameDay(DAY, OTHER_DAY)).toBe(false);
  });
});

describe('isStrictlyInside', () => {
  it('is true only for an instant strictly between the bounds', () => {
    const start = new Date('2026-03-04T08:00:00Z');
    const end = new Date('2026-03-04T09:00:00Z');

    expect(isStrictlyInside(new Date('2026-03-04T08:30:00Z'), start, end)).toBe(true);
    expect(isStrictlyInside(start, start, end)).toBe(false);
    expect(isStrictlyInside(end, start, end)).toBe(false);
  });
});

describe('contains', () => {
  it('is true when the outer range spans the inner one, ends inclusive', () => {
    const outerStart = new Date('2026-03-04T07:00:00Z');
    const outerEnd = new Date('2026-03-04T12:00:00Z');

    expect(contains(outerStart, outerEnd, new Date('2026-03-04T08:00:00Z'), new Date('2026-03-04T09:00:00Z'))).toBe(true);
    // Equal bounds are contained: the comparison is `<=`/`>=`.
    expect(contains(outerStart, outerEnd, outerStart, outerEnd)).toBe(true);
    expect(contains(outerStart, outerEnd, new Date('2026-03-04T06:00:00Z'), new Date('2026-03-04T09:00:00Z'))).toBe(false);
  });
});
