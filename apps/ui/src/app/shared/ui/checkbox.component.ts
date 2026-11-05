import { Component, input, output } from '@angular/core';

let nextCheckboxId = 0;

/**
 * A labelled native checkbox.
 *
 * The label wraps the control, so the accessible name and the click target are
 * the same element — a common source of "the label does nothing" bugs when they
 * are siblings.
 */
@Component({
  selector: 'book-space-checkbox',
  template: `
    <label class="bs-checkbox">
      <input
        [id]="id"
        type="checkbox"
        [checked]="checked()"
        [disabled]="disabled()"
        (change)="handleChange($event)"
      />
      <span>{{ label() }}</span>
    </label>
  `,
  styles: [
    `
      .bs-checkbox {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    `,
  ],
})
export class CheckboxComponent {
  readonly label = input.required<string>();
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly checkedChange = output<boolean>();

  readonly id = `bs-checkbox-${nextCheckboxId++}`;

  handleChange(event: Event): void {
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }
}
