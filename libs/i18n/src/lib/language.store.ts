import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  DEFAULT_LANGUAGE,
  ILanguage,
  LANGUAGES,
  isSupportedLanguage,
  persistLanguage,
  readStoredLanguage,
} from './languages';

/**
 * The active language, as a signal, and the switch that changes it (T211).
 *
 * A signal store rather than a bare service because the language switch and any component that
 * reads the current language are templates, both of which want the value synchronously. The
 * translation *strings* are read through the `translate` pipe (which the service marks dirty on
 * a change), so this store only owns the choice, its persistence and the `lang` attribute — it
 * does not hold the translations.
 *
 * `set` returns a promise that resolves when the language file has loaded (or when the load
 * failed, which is logged and swallowed). The app initializer awaits it so the first paint is
 * in the stored language rather than a flash of keys; a component calling `set` from a click
 * can ignore the promise, since the pipe re-renders when the load completes.
 */
@Injectable({ providedIn: 'root' })
export class LanguageStore {
  private readonly translate = inject(TranslateService);
  private readonly codeSignal = signal<string>(DEFAULT_LANGUAGE);

  /** The active language code. */
  readonly language = this.codeSignal.asReadonly();

  /** The languages the switch offers, from the single list (FR-013). */
  readonly available: readonly ILanguage[] = LANGUAGES;

  /**
   * Reads the stored preference and applies it.
   *
   * Called from the app initializer before the first route resolves. It never rejects: a failed
   * language load (a missing file, an offline start) leaves the app on the default rather than
   * aborting bootstrap and blanking the page — the same contract `AuthService.restore()` has.
   */
  initialize(): Promise<void> {
    return this.set(readStoredLanguage());
  }

  /**
   * Switches the active language and persists the choice (FR-003, FR-004).
   *
   * An unsupported code falls back to the default rather than requesting a file that does not
   * exist. The `lang` attribute is kept in step for screen readers (T223).
   */
  async set(code: string): Promise<void> {
    const target = isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
    this.codeSignal.set(target);
    persistLanguage(target);
    applyDocumentLanguage(globalThis.document, target);
    try {
      await firstValueFrom(this.translate.use(target));
    } catch {
      // The load failure is the loader's to report; the app stays usable on the fallback
      // language rather than rejecting the initializer.
    }
  }
}

/**
 * Mirrors the active language onto `<html lang>`, so a screen reader announces the right one
 * (T223, FR-003).
 *
 * `doc` is passed rather than read from the global so the absent-document case (a non-browser
 * host) is one testable call instead of a branch that only a real browser would exercise.
 */
export const applyDocumentLanguage = (doc: Document | undefined, code: string): void => {
  if (doc !== undefined) {
    doc.documentElement.lang = code;
  }
};
