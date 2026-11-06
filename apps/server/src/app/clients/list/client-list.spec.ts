import {DEFAULT_LIMIT} from '../../bookings/list/booking-list';
import {SEARCH_FIELDS, buildClientQuery, resolveClientListRequest} from './client-list';

describe('resolveClientListRequest', () => {
  it('defaults to page 1 and the shared default limit', () => {
    expect(resolveClientListRequest({})).toEqual({
      filter: {search: undefined},
      pagination: {page: 1, limit: DEFAULT_LIMIT, skip: 0},
    });
  });

  it('derives the offset from the page and carries the limit', () => {
    expect(resolveClientListRequest({page: 3, limit: 10})).toEqual({
      filter: {search: undefined},
      pagination: {page: 3, limit: 10, skip: 20},
    });
  });

  it('keeps the search term in the filter', () => {
    expect(resolveClientListRequest({search: 'Kowalski'}).filter).toEqual({search: 'Kowalski'});
  });
});

describe('buildClientQuery', () => {
  it('matches the term against every searchable field, case-insensitively', () => {
    const pattern = {$regex: 'Kowalski', $options: 'i'};
    expect(buildClientQuery({search: 'Kowalski'})).toEqual({
      $or: SEARCH_FIELDS.map((field) => ({[field]: pattern})),
    });
  });

  it('covers name, contact person, e-mail and phone', () => {
    expect(SEARCH_FIELDS).toEqual(['name', 'contactPerson', 'email', 'phone']);
  });

  it('omits the search when it is absent, empty or whitespace', () => {
    // A `$regex: ''` matches every record, which would look like a working search that
    // returns everything; the term is dropped instead.
    expect(buildClientQuery({})).toEqual({});
    expect(buildClientQuery({search: ''})).toEqual({});
    expect(buildClientQuery({search: '   '})).toEqual({});
  });

  it('trims the term before matching', () => {
    expect(buildClientQuery({search: '  Kowalski  '})).toEqual({
      $or: SEARCH_FIELDS.map((field) => ({[field]: {$regex: 'Kowalski', $options: 'i'}})),
    });
  });

  it('escapes regex metacharacters so the term is a substring, not a pattern', () => {
    // Without escaping `a.b` would match `axb` and `(` would be an invalid expression the
    // driver rejects; the search is a substring match.
    const escaped = buildClientQuery({search: 'a.b'}) as {$or: Array<Record<string, unknown>>};
    expect(escaped.$or[0]).toEqual({name: {$regex: 'a\\.b', $options: 'i'}});
    const parens = buildClientQuery({search: '(x)'}) as {$or: Array<Record<string, unknown>>};
    expect(parens.$or[0]).toEqual({name: {$regex: '\\(x\\)', $options: 'i'}});
  });
});
