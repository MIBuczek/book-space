import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  imports: [ModalComponent],
  template: `<book-space-modal [open]="open()" title="Confirm" (closed)="onClosed()">
    <p>Body text</p>
  </book-space-modal>`,
})
class HostComponent {
  // A signal, not a plain field: the app is zoneless, so only a signal marks
  // the host view dirty and re-renders the binding on a later change-detection
  // pass. A plain field would render once and then silently stop updating,
  // which is a test artefact rather than a component defect.
  readonly open = signal(false);
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

  it('stays closed while open is false', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    expect(dialog.open).toBe(false);
  });

  it('opens modally when open becomes true and projects the body', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Body text');
  });

  it('closes and reports when the close button is pressed', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    (dialog.querySelector('button') as HTMLButtonElement).click();

    expect(dialog.open).toBe(false);
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('closes when open goes back to false', async () => {
    const fixture = await create();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog.open).toBe(false);
  });
});
