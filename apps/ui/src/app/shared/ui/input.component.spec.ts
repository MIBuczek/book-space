import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InputComponent } from './input.component';

@Component({
  imports: [InputComponent],
  template: `<book-space-input label="E-mail" type="email" [error]="error" (valueChange)="onChange($event)" />`,
})
class HostComponent {
  error: string | null = null;
  value = '';
  onChange(value: string): void {
    this.value = value;
  }
}

describe('InputComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('associates the label with the control', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

    expect(input.id).not.toBe('');
    expect(label.textContent).toContain('E-mail');
    expect(input.type).toBe('email');
  });

  it('emits the typed value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'a@b.c';
    input.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.value).toBe('a@b.c');
  });

  it('renders an alert and marks the field invalid when there is an error', async () => {
    const fixture = await create();
    fixture.componentInstance.error = 'Required';
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-error`);
    expect(alert.textContent).toContain('Required');
  });
});
