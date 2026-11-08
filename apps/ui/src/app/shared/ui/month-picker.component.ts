import { Component, input, output } from '@angular/core';
import { formatFacilityDate, instantFromLegacyLocal } from '@booking/date-time';

let nextMonthPickerId = 0;

/**
 * A month picker that speaks the facility's calendar, not the browser's.
 *
 * A native `<input type="month">` gives the keyboard and mobile behaviour for free; the
 * reporting range is monthly, so the Summary tab needs a month, not a day, and reusing the
 * date picker would let a caller pick a day that the server widens to its whole month anyway.
 *
 * The value is converted on the boundary exactly as the date picker does: the control's
 * `YYYY-MM` is a *civil* month in `Europe/Warsaw`, so the first day of it is turned into an
 * instant with the shared `instantFromLegacyLocal` helper rather than `new Date(value)`, which
 * would read it in the browser's zone and shift the month for a user abroad (R4).
 */
@Component({
  selector: 'book-space-month-picker',
  template: `
    <label class="bs-field">
      <span class="bs-field__label">{{ label() }}</span>
      <input
        [id]="id"
        type="month"
        [value]="displayValue()"
        [disabled]="disabled()"
        (change)="handleChange($event)"
      />
    </label>
  `,
  styles: [
    `
      .bs-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .bs-field__label {
        font-weight: 600;
      }
    `,
  ],
})
export class MonthPickerComponent {
  readonly label = input.required<string>();
  readonly value = input<Date | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<Date>();

  readonly id = `bs-month-${nextMonthPickerId++}`;

  /** The control's value: `YYYY-MM` in the facility's calendar, or empty when unset. */
  displayValue(): string {
    const value = this.value();
    return value === null ? '' : formatFacilityDate(value).slice(0, 7);
  }

  handleChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw !== '') {
      // The control yields `YYYY-MM`; the facility-local start of that month is the instant the
      // server widens to the whole month.
      this.valueChange.emit(instantFromLegacyLocal(`${raw}-01 00:00`));
    }
  }
}
