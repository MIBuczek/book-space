import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CheckboxComponent } from './checkbox.component';

@Component({
  imports: [CheckboxComponent],
  template: `<book-space-checkbox label="Accept" (checkedChange)="onChange($event)" />`,
})
class HostComponent {
  checked = false;
  onChange(checked: boolean): void {
    this.checked = checked;
  }
}

describe('CheckboxComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('labels the control and reports toggles', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(fixture.nativeElement.textContent).toContain('Accept');
    input.checked = true;
    input.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.checked).toBe(true);
  });
});
