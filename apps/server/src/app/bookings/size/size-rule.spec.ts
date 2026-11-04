import {isSizeOffered} from './size-rule';

describe('isSizeOffered', () => {
  const facility = {sizes: ['1/1', '1/2', '1/4', '3/4']};

  it('accepts a size the facility offers', () => {
    expect(isSizeOffered('1/2', facility)).toBe(true);
  });

  it('rejects a size the facility does not offer', () => {
    // The crafted payload the issue names: `3/4` on a facility that rents `1/1` only.
    expect(isSizeOffered('3/4', {sizes: ['1/1']})).toBe(false);
  });

  it('accepts every size in the offered set', () => {
    for (const size of facility.sizes) {
      expect(isSizeOffered(size, facility)).toBe(true);
    }
  });

  it('is exact, so a size that only resembles an offered one is rejected', () => {
    // `1/2` and `1/3` are both valid sizes in the vocabulary but differ; a comparison
    // that normalised or prefix-matched would accept the wrong one.
    expect(isSizeOffered('1/3', {sizes: ['1/1', '1/2']})).toBe(false);
  });

  it('does not apply the rule when the facility is missing', () => {
    // Existence is T059's question, not this rule's; a missing facility must not be
    // reported as a bad size.
    expect(isSizeOffered('3/4', null)).toBe(true);
    expect(isSizeOffered('3/4', undefined)).toBe(true);
  });

  it('treats a facility with no sizes as offering nothing', () => {
    // The schema forbids an empty list, but the rule is written against the type rather
    // than the schema, so an empty list must still answer `false` rather than throw.
    expect(isSizeOffered('1/1', {sizes: []})).toBe(false);
  });
});
