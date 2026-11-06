import {
  BookingRangeRequiredError,
  buildBookingQuery,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  resolveBookingListRequest,
  resolveListRange,
  resolvePagination,
} from './booking-list';

const NOW = new Date('2026-09-15T12:00:00+02:00');
const AUG = new Date('2026-08-01T00:00:00+02:00');
const SEP = new Date('2026-09-30T23:59:59+02:00');

describe('resolveListRange', () => {
  describe('public caller', () => {
    it('requires both bounds', () => {
      expect(() => resolveListRange({}, {staff: false, now: NOW})).toThrow(BookingRangeRequiredError);
      expect(() => resolveListRange({from: AUG}, {staff: false, now: NOW})).toThrow(BookingRangeRequiredError);
      expect(() => resolveListRange({to: SEP}, {staff: false, now: NOW})).toThrow(BookingRangeRequiredError);
    });

    it('returns the bounds it was given', () => {
      expect(resolveListRange({from: AUG, to: SEP}, {staff: false, now: NOW})).toEqual({from: AUG, to: SEP});
    });

    it('refuses an unbounded read even when all is requested', () => {
      // `all` is a staff widening; a public caller cannot use it to skip the period rule.
      expect(() => resolveListRange({all: true}, {staff: false, now: NOW})).toThrow(BookingRangeRequiredError);
    });
  });

  describe('staff caller', () => {
    it('defaults to the current academic year', () => {
      const range = resolveListRange({}, {staff: true, now: NOW});

      expect(range.from).toEqual(new Date('2026-07-31T22:00:00.000Z'));
      expect(range.to).toEqual(new Date('2027-08-31T21:59:59.999Z'));
    });

    it('lets an explicit bound override the default, one end at a time', () => {
      const fromOnly = resolveListRange({from: AUG}, {staff: true, now: NOW});
      expect(fromOnly.from).toEqual(AUG);
      expect(fromOnly.to).toEqual(new Date('2027-08-31T21:59:59.999Z'));

      const toOnly = resolveListRange({to: SEP}, {staff: true, now: NOW});
      expect(toOnly.from).toEqual(new Date('2026-07-31T22:00:00.000Z'));
      expect(toOnly.to).toEqual(SEP);
    });

    it('clears both bounds when all is set', () => {
      expect(resolveListRange({all: true}, {staff: true, now: NOW})).toEqual({});
      expect(resolveListRange({from: AUG, all: true}, {staff: true, now: NOW})).toEqual({});
    });
  });
});

describe('resolvePagination', () => {
  it('defaults to page 1 and the default limit', () => {
    expect(resolvePagination({})).toEqual({page: 1, limit: DEFAULT_LIMIT, skip: 0});
  });

  it('derives the offset from the page', () => {
    expect(resolvePagination({page: 3, limit: 10})).toEqual({page: 3, limit: 10, skip: 20});
  });

  it('caps a limit above the maximum rather than rejecting it', () => {
    expect(resolvePagination({limit: 5_000}).limit).toBe(MAX_LIMIT);
  });
});

describe('resolveBookingListRequest', () => {
  it('forces the public filter regardless of the query flags', () => {
    const {filter} = resolveBookingListRequest(
      {from: AUG, to: SEP, accepted: false, archive: true, clientId: 'c1'},
      {staff: false, now: NOW}
    );

    // FR-005 is a rule, not a default a public caller may override.
    expect(filter).toMatchObject({accepted: true, archive: false, from: AUG, to: SEP});
    expect(filter.clientId).toBeUndefined();
  });

  it('keeps the staff filters, including accepted and archive', () => {
    const {filter} = resolveBookingListRequest(
      {accepted: false, archive: true, clientId: 'c1', city: 'siechnice', building: 'Hala'},
      {staff: true, now: NOW}
    );

    expect(filter).toMatchObject({
      accepted: false,
      archive: true,
      clientId: 'c1',
      city: 'siechnice',
      building: 'Hala',
    });
  });

  it('defaults archive to false for staff who do not name it', () => {
    const {filter} = resolveBookingListRequest({}, {staff: true, now: NOW});

    expect(filter.archive).toBe(false);
    expect(filter.accepted).toBeUndefined();
  });

  it('refuses an unbounded public request before any query is built', () => {
    expect(() => resolveBookingListRequest({}, {staff: false, now: NOW})).toThrow(BookingRangeRequiredError);
  });
});

describe('buildBookingQuery', () => {
  it('always carries the archive flag', () => {
    expect(buildBookingQuery({archive: false})).toEqual({archive: false});
  });

  it('maps the period to an inclusive createdAt range', () => {
    expect(buildBookingQuery({archive: false, from: AUG, to: SEP})).toEqual({
      archive: false,
      createdAt: {$gte: AUG, $lte: SEP},
    });
  });

  it('opens the range on the side that has no bound', () => {
    expect(buildBookingQuery({archive: false, from: AUG})).toEqual({archive: false, createdAt: {$gte: AUG}});
    expect(buildBookingQuery({archive: false, to: SEP})).toEqual({archive: false, createdAt: {$lte: SEP}});
  });

  it('reads the facility fields off the nested place object', () => {
    expect(buildBookingQuery({archive: false, city: 'siechnice', building: 'Hala'})).toEqual({
      archive: false,
      'place.city': 'siechnice',
      'place.place': 'Hala',
    });
  });

  it('omits accepted when the caller did not filter on it', () => {
    expect(buildBookingQuery({archive: false})).not.toHaveProperty('accepted');
    expect(buildBookingQuery({archive: false, accepted: false})).toMatchObject({accepted: false});
  });

  it('omits clientId when absent', () => {
    expect(buildBookingQuery({archive: false})).not.toHaveProperty('clientId');
    expect(buildBookingQuery({archive: false, clientId: 'c1'})).toMatchObject({clientId: 'c1'});
  });

  describe('tenant-name search', () => {
    it('matches the tenant name case-insensitively', () => {
      expect(buildBookingQuery({archive: false, search: 'Kowalski'})).toMatchObject({
        personName: {$regex: 'Kowalski', $options: 'i'},
      });
    });

    it('omits the search when it is absent, empty or whitespace', () => {
      expect(buildBookingQuery({archive: false})).not.toHaveProperty('personName');
      expect(buildBookingQuery({archive: false, search: ''})).not.toHaveProperty('personName');
      expect(buildBookingQuery({archive: false, search: '   '})).not.toHaveProperty('personName');
    });

    it('trims the term before matching', () => {
      expect(buildBookingQuery({archive: false, search: '  Kowalski  '})).toMatchObject({
        personName: {$regex: 'Kowalski', $options: 'i'},
      });
    });

    it('escapes regex metacharacters so the term is a substring, not a pattern', () => {
      // Without escaping, `a.b` would match `axb` and `(` would be an invalid expression the
      // driver rejects; the search is a substring match, not a pattern.
      expect(buildBookingQuery({archive: false, search: 'a.b'})).toMatchObject({
        personName: {$regex: 'a\\.b', $options: 'i'},
      });
      expect(buildBookingQuery({archive: false, search: '(x)'})).toMatchObject({
        personName: {$regex: '\\(x\\)', $options: 'i'},
      });
    });
  });
});
