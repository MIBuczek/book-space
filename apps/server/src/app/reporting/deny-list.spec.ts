import {DEFAULT_SUMMARY_DENY_LIST, isSummaryDenied, parseDenyList} from './deny-list';

describe('parseDenyList', () => {
  it('defaults to an empty list when unset or blank', () => {
    expect(parseDenyList(undefined)).toEqual([]);
    expect(parseDenyList('   ')).toEqual([]);
    expect(DEFAULT_SUMMARY_DENY_LIST).toBe('');
  });

  it('splits, trims and lower-cases a comma-separated list', () => {
    expect(parseDenyList(' A@Example.com , b@example.com ')).toEqual(['a@example.com', 'b@example.com']);
  });

  it('drops empty entries so a trailing comma cannot add a blank account', () => {
    expect(parseDenyList('a@example.com,,')).toEqual(['a@example.com']);
  });
});

describe('isSummaryDenied', () => {
  const list = parseDenyList('denied@example.com');

  it('denies the listed account, case-insensitively', () => {
    expect(isSummaryDenied('denied@example.com', list)).toBe(true);
    expect(isSummaryDenied('Denied@Example.com', list)).toBe(true);
  });

  it('allows an account that is not listed', () => {
    expect(isSummaryDenied('ada@example.com', list)).toBe(false);
  });

  it('does not deny a caller with no e-mail', () => {
    expect(isSummaryDenied(undefined, list)).toBe(false);
  });

  it('denies nobody when the list is empty', () => {
    expect(isSummaryDenied('denied@example.com', [])).toBe(false);
  });
});
