import { Component, input, output } from '@angular/core';

let nextInputId = 0;

/**
 * A labelled text input.
 *
 * The `<label>` is bound to the control with a generated id, so every use has an
 * associated label without the caller having to invent one — the
 * `label-has-associated-control` rule is an error, and a kit control that could
 * be used unlabelled would be a trap.
 */
@Component({
  selector: 'book-space-input',
  template: `
    <label class="bs-field">
      <span class="bs-field__label">{{ label() }}</span>
      <input
        [id]="id"
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="error() ? id + '-error' : null"
        (input)="handleInput($event)"
      />
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
export class InputComponent {
  readonly label = input.required<string>();
  readonly value = input('');
  readonly type = input<'text' | 'email' | 'password' | 'number'>('text');
  readonly placeholder = input('');
  readonly error = input<string | null>(null);
  readonly valueChange = output<string>();

  private readonly generatedId = `bs-input-${nextInputId++}`;
  readonly id = this.generatedId;

  handleInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
