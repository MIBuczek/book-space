export {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_CODES,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  readStoredLanguage,
  persistLanguage,
} from './lib/languages';
export type { ILanguage } from './lib/languages';
export { LanguageStore } from './lib/language.store';
export { provideAppI18n } from './lib/translate.providers';
export { injectTranslate } from './lib/translate';
export type { TranslateFn } from './lib/translate';
