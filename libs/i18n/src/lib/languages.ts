/**
 * The languages the UI offers, and the persisted preference (T210).
 *
 * This module is the single source of truth for the language list (constitution IV): the
 * switch renders it, the store validates against it, and the completeness spec iterates it.
 * Adding a language is one entry here plus one JSON file — no component, template or spec
 * changes (FR-013).
 *
 * It imports nothing from Angular, so it is usable from a plain spec and from the provider
 * alike.
 */

/** One selectable language. */
export interface ILanguage {
  /** The IETF code used as the file name (`pl.json`) and the `lang` attribute. */
  code: string;
  /** The endonym — the language's own name, so a speaker recognises it in the switch. */
  label: string;
  /** Whether this is the language the app starts in when nothing is stored. */
  default: boolean;
}

/**
 * Every language the UI ships, in the order the switch offers them.
 *
 * Polish is the default: the current audience is Polish and English is the addition
 * (spec.md Clarifications). The default is a property of the entry, not a scattered
 * assumption, so changing it is one edit.
 */
export const LANGUAGES: readonly ILanguage[] = [
  { code: 'pl', label: 'Polski', default: true },
  { code: 'en', label: 'English', default: false },
];

/**
 * The language the app starts in when nothing is stored.
 *
 * Written as a literal rather than derived from `LANGUAGES` so it is a `string` the callers can
 * pass to `TranslateService.use` without a non-null assertion; a spec asserts it is the one
 * entry flagged `default`, so the two cannot drift.
 */
export const DEFAULT_LANGUAGE = 'pl';

/** The codes, for `TranslateService.addLangs` and the supported-language check. */
export const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((language) => language.code);

/** The `localStorage` key the preference is stored under (data-model.md §3). */
export const LANGUAGE_STORAGE_KEY = 'book-space.language';

/**
 * Whether a value names a language the app ships.
 *
 * A stored value is checked before it is used, so a stale or hand-edited preference falls back
 * to the default rather than requesting a `<code>.json` that does not exist (data-model.md §3:
 * "an unknown value is ignored").
 */
export const isSupportedLanguage = (code: string | null | undefined): code is string =>
  code !== null && code !== undefined && LANGUAGE_CODES.includes(code);

/**
 * The stored preference, or the default.
 *
 * Storage is read defensively: a sandboxed iframe or a browser with storage disabled throws on
 * access, and the app must not fail to start over a language preference. The default is the
 * correct fallback in every one of those cases.
 */
export const readStoredLanguage = (): string => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

/** Persists the preference. Best-effort: the in-memory state is already updated. */
export const persistLanguage = (code: string): void => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // See `readStoredLanguage`.
  }
};
