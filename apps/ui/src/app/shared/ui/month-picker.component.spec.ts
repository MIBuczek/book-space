import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { formatFacilityDate } from '@booking/date-time';
import { MonthPickerComponent } from './month-picker.component';

@Component({
  imports: [MonthPickerComponent],
  template: `<book-space-month-picker
    label="Od miesiąca"
    [value]="value"
    [disabled]="disabled"
    (valueChange)="onChange($event)"
  />`,
})
class HostComponent {
  value: Date | null = null;
  disabled = false;
  changed: Date | null = null;
  onChange(value: Date): void {
    this.changed = value;
  }
}

describe('MonthPickerComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('renders the value as a facility-calendar month', async () => {
    const fixture = await create();
    // 2026-01-31T23:30Z is 00:30 on 1 February in Warsaw, so the civil month is February —
    // the browser-zone answer would differ for a user behind UTC.
    fixture.componentInstance.value = new Date('2026-01-31T23:30:00Z');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.type).toBe('month');
    expect(input.value).toBe('2026-02');
  });

  it('renders an empty control when the value is unset', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.value).toBe('');
  });

  it('converts a picked month to the first instant of that month in the facility zone', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '2026-03';
    input.dispatchEvent(new Event('change'));

    const changed = fixture.componentInstance.changed as Date;
    expect(changed).not.toBeNull();
    expect(formatFacilityDate(changed)).toBe('2026-03-01');
  });

  it('ignores an empty value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '';
    input.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.changed).toBeNull();
  });

  it('disables the control when asked, for the from-the-beginning option', async () => {
    const fixture = await create();
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.disabled).toBe(true);
  });
});
