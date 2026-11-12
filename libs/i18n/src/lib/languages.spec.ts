import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  persistLanguage,
  readStoredLanguage,
} from './languages';

/**
 * The language list and the stored preference (T210, data-model.md §3).
 *
 * These are pure functions over `localStorage`, so they are tested directly rather than through
 * the store: the store is a thin wrapper that owns a signal, and the fallback rules are the
 * behaviour worth pinning.
 */
describe('languages', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('declares exactly one default language, and it is the constant', () => {
    const defaults = LANGUAGES.filter((language) => language.default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].code).toBe(DEFAULT_LANGUAGE);
  });

  it('exposes the codes in list order', () => {
    expect(LANGUAGE_CODES).toEqual(LANGUAGES.map((language) => language.code));
  });

  it('labels each language with its own endonym', () => {
    expect(LANGUAGES.map((language) => language.label)).toEqual(['Polski', 'English']);
  });

  describe('isSupportedLanguage', () => {
    it('accepts a declared code', () => {
      expect(isSupportedLanguage('en')).toBe(true);
    });

    it('rejects an undeclared code, null and undefined', () => {
      expect(isSupportedLanguage('de')).toBe(false);
      expect(isSupportedLanguage(null)).toBe(false);
      expect(isSupportedLanguage(undefined)).toBe(false);
    });
  });

  describe('readStoredLanguage', () => {
    it('returns the default when storage holds nothing', () => {
      expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('returns a stored supported code', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
      expect(readStoredLanguage()).toBe('en');
    });

    it('falls back to the default for an unknown stored code', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
      expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('falls back to the default when storage access throws', () => {
      const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled');
      });
      expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
      spy.mockRestore();
    });
  });

  describe('persistLanguage', () => {
    it('writes the code under the storage key', () => {
      persistLanguage('en');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    });

    it('swallows a storage failure rather than throwing', () => {
      const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage disabled');
      });
      expect(() => persistLanguage('en')).not.toThrow();
      spy.mockRestore();
    });
  });
});
