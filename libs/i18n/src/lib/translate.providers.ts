import { EnvironmentProviders, Provider, provideAppInitializer, inject } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { LanguageStore } from './language.store';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from './languages';

/**
 * Wires `@ngx-translate/core` into the app (T212, plan D1).
 *
 * The provider functions sit *inside* `provideTranslateService`, not as siblings — that is
 * ngx-translate's required shape, and getting it wrong leaves the loader unregistered so every
 * key renders as itself.
 *
 * The language files are static assets served from `/assets/i18n/`, so one build serves every
 * language and adding a language is adding a file (FR-013, plan D8). The app initializer awaits
 * the stored language's load before the first route resolves, so the first paint is translated
 * rather than a flash of keys; it completes even on a failed load, so a missing file cannot
 * abort bootstrap.
 */
export const provideAppI18n = (): (Provider | EnvironmentProviders)[] => [
  provideTranslateService({
    loader: provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    // Active language → default language → the key itself (FR-005). The default missing
    // handler returns the key, which the fallback spec pins.
    fallbackLang: DEFAULT_LANGUAGE,
    lang: DEFAULT_LANGUAGE,
    langs: [...LANGUAGE_CODES],
  }),
  provideAppInitializer(() => inject(LanguageStore).initialize()),
];
