import { inject, provideAppInitializer } from '@angular/core';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import { TranslateFn } from '@booking/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reads a shipped catalogue for a spec (T235).
 *
 * Exposed so a spec that asserts a catalogue value — a link's `href`, a validation message —
 * reads the same file the app loads rather than a second copy of the string. A key that moves
 * in the JSON then fails the spec instead of silently passing against a stale literal.
 */
export const testCatalogue = (code: string): TranslationObject =>
  JSON.parse(readFileSync(join(__dirname, '..', 'assets', 'i18n', `${code}.json`), 'utf8'));

/**
 * Provides `@ngx-translate/core` with the shipped catalogues for a component spec (T235).
 *
 * A spec that renders a migrated component needs the real translations, not a stub: the point
 * of the migration is that the rendered DOM is the catalogue's text, and a spec asserting
 * against a hand-built stub would pass even if the key were wrong. The files are read from
 * `apps/ui/src/assets/i18n` — the same files the app loads — so a key a spec depends on cannot
 * drift from the one the app ships.
 *
 * Both languages are registered up front, and the active one is set from the config, so a spec
 * that switches language can assert the other catalogue without a second loader round trip.
 */
export const provideTestI18n = (lang = 'pl') => [
  provideTranslateService({ fallbackLang: 'pl', lang }),
  provideAppInitializer(() => {
    const translate = inject(TranslateService);
    translate.setTranslation('pl', testCatalogue('pl'));
    translate.setTranslation('en', testCatalogue('en'));
  }),
];

/** Reads a dotted key from a nested catalogue, the way `TranslateService.instant` resolves one. */
const lookup = (catalogue: TranslationObject, key: string): unknown =>
  key.split('.').reduce<unknown>((value, part) => {
    if (value !== null && typeof value === 'object') {
      return (value as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalogue);

/**
 * A `TranslateFn` over a shipped catalogue, for a pure-fn spec (T235).
 *
 * `bookings-table.ts` and its siblings take a `TranslateFn` so they stay pure, so a spec that
 * drives them passes their real catalogue entry here instead of rendering a component. Interpolates
 * `{{param}}` the way ngx-translate does, so a parameterised message is asserted as the user
 * would see it.
 */
export const testTranslate =
  (code = 'pl'): TranslateFn =>
  (key, params) => {
    const value = lookup(testCatalogue(code), key);
    if (value === undefined) {
      return key;
    }
    // A non-string entry (the calendar's weekday and month arrays) is returned as-is, matching
    // `TranslateService.instant`, so a spec can assert the array the app actually ships.
    if (typeof value !== 'string') {
      return value as unknown as string;
    }
    return Object.entries(params ?? {}).reduce(
      (text, [name, param]) => text.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(param)),
      value
    );
  };
