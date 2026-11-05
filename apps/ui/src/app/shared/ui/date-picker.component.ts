import { Component, input, output } from '@angular/core';
import { instantFromLegacyLocal, formatFacilityDate } from '@booking/date-time';

let nextDatePickerId = 0;

/**
 * A date picker that speaks the facility's calendar, not the browser's.
 *
 * A native `<input type="date">` gives the keyboard and mobile behaviour for
 * free. The value is converted on the boundary: the control's `YYYY-MM-DD` is a
 * *civil* date in `Europe/Warsaw`, so it is turned into an instant with the
 * shared `instantFromLegacyLocal` helper rather than `new Date(value)`, which
 * would read it in the browser's zone and shift the day for a user abroad. That
 * is the same defect R4 names for the API.
 */
@Component({
  selector: 'book-space-date-picker',
  template: `
    <label class="bs-field">
      <span class="bs-field__label">{{ label() }}</span>
      <input
        [id]="id"
        type="date"
        [value]="displayValue()"
        [min]="min()"
        [max]="max()"
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
export class DatePickerComponent {
  readonly label = input.required<string>();
  readonly value = input<Date | null>(null);
  readonly min = input('');
  readonly max = input('');
  readonly valueChange = output<Date>();

  readonly id = `bs-date-${nextDatePickerId++}`;

  displayValue(): string {
    const value = this.value();
    return value === null ? '' : formatFacilityDate(value);
  }

  handleChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw !== '') {
      // The control yields a civil date with no time; the facility-local start
      // of that day is the instant the rest of the app expects.
      this.valueChange.emit(instantFromLegacyLocal(`${raw} 00:00`));
    }
  }
}
