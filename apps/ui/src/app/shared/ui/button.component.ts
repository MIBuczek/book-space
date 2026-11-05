import { Component, input, output } from '@angular/core';

type TButtonVariant = 'primary' | 'secondary' | 'danger';

/**
 * The one button in the kit. A real `<button>` so it is keyboard reachable and
 * has an accessible role for free — a styled `<div>` would need all of that
 * re-added, and the accessibility rules reject it anyway.
 *
 * `type` defaults to `button`: a button inside a form that omits it submits,
 * which is almost never what a caller wants and is a classic silent bug.
 */
@Component({
  selector: 'book-space-button',
  template: `
    <button
      [type]="type()"
      [class]="'bs-button bs-button--' + variant()"
      [disabled]="disabled()"
      (click)="pressed.emit($event)"
    >
      <ng-content />
    </button>
  `,
  styles: [
    `
      .bs-button {
        font: inherit;
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 0.5rem 1rem;
      }
      .bs-button--primary {
        background: #2f6f3e;
        color: #fff;
      }
      .bs-button--secondary {
        background: #fff;
        color: #2f6f3e;
        border-color: #2f6f3e;
      }
      .bs-button--danger {
        background: #a4262c;
        color: #fff;
      }
      .bs-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
})
export class ButtonComponent {
  readonly variant = input<TButtonVariant>('primary');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly pressed = output<MouseEvent>();
}
