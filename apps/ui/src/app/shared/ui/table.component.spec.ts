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
    [expandAll]="expandAll"
  >
    <ng-template #rowActions let-row>
      <button type="button" class="act" (click)="acted(row['_id'])">Act</button>
    </ng-template>
    <ng-template #rowDetails let-row>
      <span class="detail">Detail {{ row['_id'] }}</span>
    </ng-template>
  </book-space-table>`,
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
  expandAll = false;
  actedWith = '';
  acted(id: unknown): void {
    this.actedWith = String(id);
  }
}

/** The same table with no projected templates, to prove they are optional. */
@Component({
  imports: [TableComponent],
  template: `<book-space-table [columns]="columns" [rows]="rows" emptyMessage="Empty." />`,
})
class PlainHostComponent {
  columns: ITableColumn[] = [{ key: '_id', label: 'Id' }];
  rows: Record<string, unknown>[] = [];
}

describe('TableComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  it('renders a header per column and a cell per row value', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const headers = fixture.nativeElement.querySelectorAll('thead th');
    // The trailing action cell is asserted separately; here only the data columns.
    const cells = fixture.nativeElement.querySelectorAll('tbody td:not(:last-child)');

    expect(Array.from(headers).map((h) => (h as HTMLElement).textContent?.trim())).toEqual([
      'Id',
      'Nick',
      'Actions',
    ]);
    expect(Array.from(cells).map((c) => (c as HTMLElement).textContent?.trim())).toEqual([
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
    // Two columns plus the projected action column.
    expect(cell.getAttribute('colspan')).toBe('3');
  });

  it('renders an action cell per row and emits the clicked row', async () => {
    const fixture = await create();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button.act') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons[1].click();

    expect(fixture.componentInstance.actedWith).toBe('2');
  });

  it('renders no detail row while collapsed', async () => {
    const fixture = await create();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.detail')).toBeNull();
  });

  it('renders every detail row when expandAll is set', async () => {
    const fixture = await create();
    fixture.componentInstance.expandAll = true;
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelectorAll('.detail');
    expect(details.length).toBe(2);
    expect(details[1].textContent).toContain('Detail 2');
  });

  it('works without any projected template', async () => {
    await TestBed.configureTestingModule({ imports: [PlainHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlainHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('th').length).toBe(1);
    // No action column, so the empty cell spans one column.
    expect(fixture.nativeElement.querySelector('td').getAttribute('colspan')).toBe('1');
  });
});
