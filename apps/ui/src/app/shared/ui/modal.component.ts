import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

let nextModalId = 0;

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * `showModal()` gives focus trapping, `Esc` to close, inert background content, focus
 * returned to the trigger on close and a `::backdrop` for free — all of which FR-039 and
 * NFR-006 require and all of which a `<div role="dialog">` would have to re-implement.
 * Opening and closing are driven by an `effect` on the `open` input so the caller owns the
 * state and the element follows it, rather than the DOM being the source of truth.
 *
 * The body is projected, so the caller supplies its own fields and action buttons; the
 * dialog renders only the chrome (the backdrop and the accessible name). The heading is
 * rendered only while open, so a closed dialog contributes no text to the document — a
 * mounted-but-closed modal must not leak its title into the page.
 */
@Component({
  selector: 'book-space-modal',
  template: `
    <dialog
      #dialog
      class="bs-modal"
      [attr.role]="role()"
      aria-modal="true"
      [attr.aria-labelledby]="open() ? titleId : null"
      (close)="closed.emit()"
    >
      @if (open()) {
        <h2 class="bs-modal__title" [id]="titleId">{{ title() }}</h2>
      }
      <div class="bs-modal__body">
        <ng-content />
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
      .bs-modal__body {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
    `,
  ],
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  /** `alertdialog` for a confirmation the user must answer, `dialog` otherwise. */
  readonly role = input<'dialog' | 'alertdialog'>('dialog');
  /** Fires when the element closes, including on `Esc`, so the caller can clear its state. */
  readonly closed = output<void>();

  /** Ties the dialog to its heading for the accessible name; unique per instance. */
  readonly titleId = `bs-modal-${nextModalId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        // `close()` restores focus to the element that was focused before `showModal()`,
        // which is the trigger. Removing the element instead would drop focus to the body.
        dialog.close();
      }
    });
  }
}
