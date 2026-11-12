import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageStore } from '@booking/i18n';

/**
 * The language switch (T220, FR-003).
 *
 * A labelled native `<select>`, like every other control in the app: it is keyboard accessible,
 * mobile friendly and screen-reader correct without re-implementing a listbox. The options come
 * from `LanguageStore.available`, which reads the single language list, so a language added to
 * `libs/i18n` appears here with no change to this component (FR-013).
 *
 * The label is translated, so the switch names itself in the language currently active.
 */
@Component({
  selector: 'book-space-language-switch',
  imports: [TranslatePipe],
  template: `
    <label class="bs-language">
      <span class="bs-language__label">{{ 'nav.language' | translate }}</span>
      <select
        class="bs-language__select"
        [attr.aria-label]="'nav.language' | translate"
        (change)="onChange($event)"
      >
        @for (language of store.available; track language.code) {
          <option [value]="language.code" [selected]="language.code === store.language()">
            {{ language.label }}
          </option>
        }
      </select>
    </label>
  `,
  styles: [
    `
      .bs-language {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .bs-language__label {
        font-size: 0.875rem;
      }
    `,
  ],
})
export class LanguageSwitchComponent {
  readonly store = inject(LanguageStore);

  onChange(event: Event): void {
    void this.store.set((event.target as HTMLSelectElement).value);
  }
}
