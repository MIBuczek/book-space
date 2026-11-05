import { Component, input } from '@angular/core';

interface ITableColumn {
  key: string;
  label: string;
}

/**
 * A data table over a row of `Record<string, unknown>`.
 *
 * Rows are rendered by the caller through `<ng-content>` projected per row is
 * not possible without a structural directive, so the cell values are read by
 * key. That keeps the table generic for T036's bookings list, which is the only
 * caller with many columns; a bespoke table there would not be reusable by the
 * clients and facilities tabs.
 *
 * `track` is the caller-supplied identity key, because a table with no stable
 * row identity re-creates every row on each render.
 */
@Component({
  selector: 'book-space-table',
  template: `
    <table class="bs-table">
      <caption class="bs-table__caption">{{ caption() }}</caption>
      <thead>
        <tr>
          @for (column of columns(); track column.key) {
            <th scope="col">{{ column.label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track rowKey(row)) {
          <tr>
            @for (column of columns(); track column.key) {
              <td>{{ cell(row, column.key) }}</td>
            }
          </tr>
        } @empty {
          <tr>
            <td [attr.colspan]="columns().length">{{ emptyMessage() }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      .bs-table {
        width: 100%;
        border-collapse: collapse;
      }
      .bs-table th,
      .bs-table td {
        border-bottom: 1px solid #d9d9d9;
        padding: 0.5rem;
        text-align: left;
      }
      .bs-table__caption {
        text-align: left;
        font-weight: 600;
        padding-bottom: 0.5rem;
      }
    `,
  ],
})
export class TableComponent {
  readonly columns = input.required<ITableColumn[]>();
  readonly rows = input.required<Record<string, unknown>[]>();
  readonly caption = input('');
  readonly emptyMessage = input('No records.');
  /** The row property whose value identifies the row, normally `_id`. */
  readonly trackKey = input('_id');

  rowKey(row: Record<string, unknown>): unknown {
    return row[this.trackKey()];
  }

  cell(row: Record<string, unknown>, key: string): unknown {
    return row[key];
  }
}

export type { ITableColumn };
