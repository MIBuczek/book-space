import { readFileSync } from 'fs';
import { join } from 'path';
import { LANGUAGES, DEFAULT_LANGUAGE } from './languages';

/**
 * Key completeness and interpolation (FR-006, SC-003, plan D4).
 *
 * Moving the copy from a TypeScript object to JSON trades a compile-time guarantee for a runtime
 * one: `COPY.calendar.title` failed the build if `title` were absent, and a JSON key does not.
 * This spec is that replacement, and it is the one that makes "a partial translation fails CI"
 * true rather than aspirational — the same reasoning as the coverage thresholds and the guard.
 *
 * It reads the *shipped* files under `apps/ui/src/assets/i18n`, not a copy, so a language file
 * that drifts from the default is caught at the file the app actually loads.
 */
const I18N_DIR = join(__dirname, '../../../../apps/ui/src/assets/i18n');

const readLanguage = (code: string): unknown =>
  JSON.parse(readFileSync(join(I18N_DIR, `${code}.json`), 'utf8'));

/** Flattens a nested translation object to dotted keys, the way ngx-translate resolves them. */
const flatten = (value: unknown, prefix = ''): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { [prefix]: value };
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix === '' ? key : `${prefix}.${key}`) }),
    {}
  );
};

/** The `{{param}}` names a value declares, so a translation that drops one is a failure. */
const parameters = (value: unknown): string[] =>
  typeof value === 'string'
    ? [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort()
    : [];

const defaultFlat = flatten(readLanguage(DEFAULT_LANGUAGE));
const defaultKeys = Object.keys(defaultFlat).sort();

describe('translations', () => {
  it('ships a file for every declared language', () => {
    for (const { code } of LANGUAGES) {
      expect(() => readLanguage(code)).not.toThrow();
    }
  });

  it('has a default language that is one of the declared languages', () => {
    expect(LANGUAGES.filter((language) => language.default).map((language) => language.code)).toEqual([
      DEFAULT_LANGUAGE,
    ]);
  });

  it('declares at least one key, so a broken read is not a silent pass', () => {
    expect(defaultKeys.length).toBeGreaterThan(0);
  });

  // The completeness rule, per language: every default key is present, and no extra key is
  // present (an extra key is a translation for a string no screen renders, which is dead data).
  for (const { code } of LANGUAGES.filter((language) => language.code !== DEFAULT_LANGUAGE)) {
    describe(`language "${code}"`, () => {
      const flat = flatten(readLanguage(code));

      it(`contains every key the default language declares`, () => {
        const missing = defaultKeys.filter((key) => !(key in flat));
        expect(missing).toEqual([]);
      });

      it(`declares no key the default language does not`, () => {
        const extra = Object.keys(flat)
          .filter((key) => !(key in defaultFlat))
          .sort();
        expect(extra).toEqual([]);
      });

      it(`preserves every interpolation parameter`, () => {
        const dropped = defaultKeys
          .filter((key) => key in flat)
          .filter(
            (key) =>
              JSON.stringify(parameters(defaultFlat[key])) !== JSON.stringify(parameters(flat[key]))
          );
        expect(dropped).toEqual([]);
      });
    });
  }

  it('has no empty value, which would render as a blank string', () => {
    const empty = defaultKeys.filter((key) => {
      const value = defaultFlat[key];
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});
