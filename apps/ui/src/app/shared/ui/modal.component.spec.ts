import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  imports: [ModalComponent],
  template: `<book-space-modal
    [open]="open()"
    [title]="title()"
    [role]="role()"
    (closed)="onClosed()"
  >
    <button type="button" class="projected">Body action</button>
  </book-space-modal>`,
})
class HostComponent {
  // A signal, not a plain field: the app is zoneless, so only a signal marks
  // the host view dirty and re-renders the binding on a later change-detection
  // pass. A plain field would render once and then silently stop updating,
  // which is a test artefact rather than a component defect.
  readonly open = signal(false);
  readonly title = signal('Confirm');
  readonly role = signal<'dialog' | 'alertdialog'>('dialog');
  closedCount = 0;
  onClosed(): void {
    this.closedCount += 1;
  }
}

describe('ModalComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  const dialogOf = (fixture: Awaited<ReturnType<typeof create>>): HTMLDialogElement =>
    fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

  it('stays closed while open is false', async () => {
    const fixture = await create();
    fixture.detectChanges();

    expect(dialogOf(fixture).open).toBe(false);
  });

  it('opens modally when open becomes true and projects the body', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dialog = dialogOf(fixture);

    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.projected')).not.toBeNull();
  });

  it('names the dialog from its heading, and only while it is open', async () => {
    const fixture = await create();
    const dialog = dialogOf(fixture);

    // Closed: no heading, so the dialog contributes no text to the document and no
    // dangling `aria-labelledby`.
    expect(dialog.textContent).not.toContain('Confirm');
    expect(dialog.getAttribute('aria-labelledby')).toBeNull();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(dialog.querySelector(`#${labelledBy}`)?.textContent).toContain('Confirm');
  });

  it('is a modal dialog, and an alertdialog when the caller asks for one', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dialog = dialogOf(fixture);

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('role')).toBe('dialog');

    fixture.componentInstance.role.set('alertdialog');
    fixture.detectChanges();

    expect(dialog.getAttribute('role')).toBe('alertdialog');
  });

  it('reports the close event the browser fires on Esc, so the caller clears its state', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    // `Esc` makes the browser close the dialog and fire `close`; the component listens for
    // that event rather than trapping the key itself, so dispatching it is the real path.
    dialogOf(fixture).dispatchEvent(new Event('close'));

    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('closes the element rather than removing it, so focus can return to the trigger', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    // `close()` restores focus to the trigger; removing the node would drop focus to the body.
    expect(dialogOf(fixture).open).toBe(false);
    expect(dialogOf(fixture)).not.toBeNull();
  });
});
