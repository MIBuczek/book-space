import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { formatFacilityDate } from '@booking/date-time';
import { DatePickerComponent } from './date-picker.component';

@Component({
  imports: [DatePickerComponent],
  template: `<book-space-date-picker label="Start" [value]="value" (valueChange)="onChange($event)" />`,
})
class HostComponent {
  value: Date | null = null;
  changed: Date | null = null;
  onChange(value: Date): void {
    this.changed = value;
  }
}

describe('DatePickerComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('renders the value as a facility-calendar civil date', async () => {
    const fixture = await create();
    // 2026-01-15T00:30Z is 01:30 on the 15th in Warsaw, so the civil date is the
    // 15th — the browser-zone answer would differ for a user behind UTC.
    fixture.componentInstance.value = new Date('2026-01-15T00:30:00Z');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.type).toBe('date');
    expect(input.value).toBe(formatFacilityDate(new Date('2026-01-15T00:30:00Z')));
  });

  it('converts a picked civil date to an instant in the facility zone', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '2026-03-10';
    input.dispatchEvent(new Event('change'));

    const changed = fixture.componentInstance.changed as Date;
    expect(changed).not.toBeNull();
    expect(formatFacilityDate(changed)).toBe('2026-03-10');
  });

  it('ignores an empty value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '';
    input.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.changed).toBeNull();
  });
});
