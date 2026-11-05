import {DEFAULT_SUMMARY_DENY_LIST, isSummaryDenied, parseDenyList} from './deny-list';

describe('parseDenyList', () => {
  it('defaults to the legacy account when unset or blank', () => {
    expect(parseDenyList(undefined)).toEqual([DEFAULT_SUMMARY_DENY_LIST]);
    expect(parseDenyList('   ')).toEqual([DEFAULT_SUMMARY_DENY_LIST]);
    expect(DEFAULT_SUMMARY_DENY_LIST).toBe('mkulakowski@umsiechnice.pl');
  });

  it('splits, trims and lower-cases a comma-separated list', () => {
    expect(parseDenyList(' A@Example.com , b@example.com ')).toEqual(['a@example.com', 'b@example.com']);
  });

  it('drops empty entries so a trailing comma cannot add a blank account', () => {
    expect(parseDenyList('a@example.com,,')).toEqual(['a@example.com']);
  });
});

describe('isSummaryDenied', () => {
  const list = parseDenyList('mkulakowski@umsiechnice.pl');

  it('denies the listed account, case-insensitively', () => {
    expect(isSummaryDenied('mkulakowski@umsiechnice.pl', list)).toBe(true);
    expect(isSummaryDenied('MKulakowski@UMSiechnice.pl', list)).toBe(true);
  });

  it('allows an account that is not listed', () => {
    expect(isSummaryDenied('ada@example.com', list)).toBe(false);
  });

  it('does not deny a caller with no e-mail', () => {
    expect(isSummaryDenied(undefined, list)).toBe(false);
  });

  it('denies nobody when the list is empty', () => {
    expect(isSummaryDenied('mkulakowski@umsiechnice.pl', [])).toBe(false);
  });
});
