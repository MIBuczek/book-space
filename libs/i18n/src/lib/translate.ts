import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * A translation lookup, with the `{{param}}` interpolations applied.
 *
 * The pure feature modules (`bookings-table.ts`, `calendar-events.ts`, …) turn values into
 * display strings but must stay pure — a plain spec has no Angular injector and no template, so
 * they cannot use the `translate` pipe or inject the service. They take this function instead,
 * and the component (which does have an injector) supplies it, so the string the module returns
 * is the active language's.
 */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * The `TranslateFn` a component passes to a pure module (T231/T232).
 *
 * It delegates to `TranslateService.instant`, which reads the service's own signals (the
 * translations and the current language), so a `computed()` that calls the returned function
 * re-runs when the language *loads* — the component's derived labels (a table column, a status
 * word, a detail row) update on a switch without a manual subscription. The template's own text
 * still goes through the `translate` pipe; this is only for the strings a pure module derives.
 */
export const injectTranslate = (): TranslateFn => {
  const translate = inject(TranslateService);
  return (key, params) => translate.instant(key, params);
};
