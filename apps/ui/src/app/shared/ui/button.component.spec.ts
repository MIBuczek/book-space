import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

@Component({
  imports: [ButtonComponent],
  template: `<book-space-button [variant]="variant" [disabled]="disabled" (pressed)="onPress()">Go</book-space-button>`,
})
class HostComponent {
  variant: 'primary' | 'secondary' | 'danger' = 'primary';
  disabled = false;
  pressed = 0;
  onPress(): void {
    this.pressed += 1;
  }
}

describe('ButtonComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('defaults to a non-submitting button with the primary variant', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.type).toBe('button');
    expect(button.classList).toContain('bs-button--primary');
  });

  it('emits on click', async () => {
    const fixture = await create();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();

    expect(fixture.componentInstance.pressed).toBe(1);
  });

  it('applies the selected variant and disables the control', async () => {
    const fixture = await create();
    fixture.componentInstance.variant = 'danger';
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.classList).toContain('bs-button--danger');
    expect(button.disabled).toBe(true);
  });
});
