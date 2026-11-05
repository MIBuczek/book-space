import { Component, input, output } from '@angular/core';

interface ISelectOption {
  value: string;
  label: string;
}

let nextSelectId = 0;

/**
 * A labelled native `<select>`.
 *
 * Native rather than a custom listbox: it is keyboard accessible, mobile
 * friendly and screen-reader correct without any of that being re-implemented.
 * `options` is a plain array because the value/label pair is the whole contract
 * and a component instance per option would be more machinery for less.
 */
@Component({
  selector: 'book-space-select',
  template: `
    <label class="bs-field">
      <span class="bs-field__label">{{ label() }}</span>
      <select [id]="id" [value]="value()" (change)="handleChange($event)">
        @if (placeholder()) {
          <option value="">{{ placeholder() }}</option>
        }
        @for (option of options(); track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      @if (error()) {
        <span class="bs-field__error" [id]="id + '-error'" role="alert">{{ error() }}</span>
      }
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
      .bs-field__error {
        color: #a4262c;
      }
    `,
  ],
})
export class SelectComponent {
  readonly label = input.required<string>();
  readonly options = input.required<ISelectOption[]>();
  readonly value = input('');
  readonly placeholder = input('');
  readonly error = input<string | null>(null);
  readonly valueChange = output<string>();

  readonly id = `bs-select-${nextSelectId++}`;

  handleChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}

export type { ISelectOption };
