import {escapeRegExp} from './escape-regexp';

describe('escapeRegExp', () => {
  it('escapes every regex metacharacter so the term is a literal', () => {
    expect(escapeRegExp('a.b*c?')).toBe('a\\.b\\*c\\?');
    expect(escapeRegExp('(x)[y]{z}')).toBe('\\(x\\)\\[y\\]\\{z\\}');
    expect(escapeRegExp('a+b|c^d$')).toBe('a\\+b\\|c\\^d\\$');
    expect(escapeRegExp('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves a plain term unchanged', () => {
    expect(escapeRegExp('Kowalski')).toBe('Kowalski');
    expect(escapeRegExp('')).toBe('');
  });

  it('produces a pattern that matches the term literally', () => {
    // The point of the escape: `a.b` must match `a.b` and not `axb`.
    const pattern = new RegExp(escapeRegExp('a.b'));
    expect(pattern.test('a.b')).toBe(true);
    expect(pattern.test('axb')).toBe(false);
  });
});
