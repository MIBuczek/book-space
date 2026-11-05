import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ITableColumn, TableComponent } from './table.component';

@Component({
  imports: [TableComponent],
  template: `<book-space-table
    caption="Bookings"
    [columns]="columns"
    [rows]="rows"
    emptyMessage="Nothing here."
  />`,
})
class HostComponent {
  columns: ITableColumn[] = [
    { key: '_id', label: 'Id' },
    { key: 'nick', label: 'Nick' },
  ];
  rows: Record<string, unknown>[] = [
    { _id: '1', nick: 'Acme' },
    { _id: '2', nick: 'Bravo' },
  ];
}

describe('TableComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('renders a header per column and a cell per row value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const headers = fixture.nativeElement.querySelectorAll('th');
    const cells = fixture.nativeElement.querySelectorAll('td');

    expect(Array.from(headers).map((h) => (h as HTMLElement).textContent)).toEqual(['Id', 'Nick']);
    expect(Array.from(cells).map((c) => (c as HTMLElement).textContent)).toEqual([
      '1',
      'Acme',
      '2',
      'Bravo',
    ]);
    expect(fixture.nativeElement.querySelector('caption').textContent).toContain('Bookings');
  });

  it('renders the empty message spanning every column', async () => {
    const fixture = await create();
    fixture.componentInstance.rows = [];
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('td') as HTMLTableCellElement;

    expect(cell.textContent).toContain('Nothing here.');
    expect(cell.getAttribute('colspan')).toBe('2');
  });
});
