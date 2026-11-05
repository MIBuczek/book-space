import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { ButtonComponent } from './button.component';

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * `showModal()` gives focus trapping, `Esc` to close, inert background content
 * and a `::backdrop` for free — all of which FR-039 requires and all of which a
 * `<div role="dialog">` would have to re-implement. Opening and closing are
 * driven by an `effect` on the `open` input so the caller owns the state and the
 * element follows it, rather than the DOM being the source of truth.
 */
@Component({
  selector: 'book-space-modal',
  imports: [ButtonComponent],
  template: `
    <dialog #dialog class="bs-modal" (close)="closed.emit()">
      <h2 class="bs-modal__title">{{ title() }}</h2>
      <div class="bs-modal__body">
        <ng-content />
      </div>
      <div class="bs-modal__actions">
        <book-space-button variant="secondary" (pressed)="close()">Close</book-space-button>
      </div>
    </dialog>
  `,
  styles: [
    `
      .bs-modal {
        border: none;
        border-radius: 6px;
        padding: 1.5rem;
        max-width: 32rem;
      }
      .bs-modal::backdrop {
        background: rgba(0, 0, 0, 0.45);
      }
      .bs-modal__title {
        margin-top: 0;
      }
      .bs-modal__actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
      }
    `,
  ],
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }
}
