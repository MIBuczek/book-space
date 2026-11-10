import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ISelectOption, SelectComponent } from './select.component';

@Component({
  imports: [SelectComponent],
  template: `<book-space-select
    label="City"
    [options]="options"
    [placeholder]="placeholder"
    [error]="error"
    (valueChange)="onChange($event)"
  />`,
})
class HostComponent {
  options: ISelectOption[] = [
    { value: 'SIECHNICE', label: 'Siechnice' },
    { value: 'KAMIENIEC', label: 'Kamieniec' },
  ];
  placeholder = 'Pick one';
  value = '';
  error: string | null = null;
  onChange(value: string): void {
    this.value = value;
  }
}

describe('SelectComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('renders a labelled control with the placeholder and every option', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.id).not.toBe('');
    expect(fixture.nativeElement.textContent).toContain('City');
    expect(select.querySelectorAll('option').length).toBe(3);
    expect(select.options[0].textContent).toContain('Pick one');
  });

  it('emits the chosen value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    select.value = 'KAMIENIEC';
    select.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.value).toBe('KAMIENIEC');
  });

  it('announces an error and marks the control invalid (NFR-006)', async () => {
    const fixture = await create();
    fixture.componentInstance.error = 'Pick a city';
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe(`${select.id}-error`);
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Pick a city');
  });
});
