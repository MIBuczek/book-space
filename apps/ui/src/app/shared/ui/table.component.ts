import { Component, contentChild, input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

interface ITableColumn {
  key: string;
  label: string;
}

/**
 * A data table over a row of `Record<string, unknown>`.
 *
 * Cell values are read by key, so a plain list (clients, facilities) needs nothing more than
 * the columns. The two projected templates cover what a key cannot express:
 *
 *  - `rowActions` adds a trailing cell per row, rendered with the row as `$implicit`, so the
 *    caller puts real buttons there. A table whose only "action" is a link does not need it.
 *  - `rowDetails` adds a full-width detail row under each row when `expandAll` is set,
 *    rendered with the row as `$implicit`. The caller owns the flag, so the expansion state
 *    stays in the feature.
 *
 * `track` is the caller-supplied identity key, because a table with no stable row identity
 * re-creates every row on each render.
 */
@Component({
  selector: 'book-space-table',
  imports: [NgTemplateOutlet],
  template: `
    <table class="bs-table">
      <caption class="bs-table__caption">{{ caption() }}</caption>
      <thead>
        <tr>
          @for (column of columns(); track column.key) {
            <th scope="col">{{ column.label }}</th>
          }
          @if (rowActions()) {
            <th scope="col">{{ actionsLabel() }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track rowKey(row)) {
          <tr>
            @for (column of columns(); track column.key) {
              <td>{{ cell(row, column.key) }}</td>
            }
            @if (rowActions(); as actions) {
              <td>
                <ng-container [ngTemplateOutlet]="actions" [ngTemplateOutletContext]="{$implicit: row}" />
              </td>
            }
          </tr>
          @if (expandAll()) {
            @if (rowDetails(); as details) {
              <tr class="bs-table__details">
                <td [attr.colspan]="columnCount()">
                  <ng-container [ngTemplateOutlet]="details" [ngTemplateOutletContext]="{$implicit: row}" />
                </td>
              </tr>
            }
          }
        } @empty {
          <tr>
            <td [attr.colspan]="columnCount()">{{ emptyMessage() }}</td>
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
        vertical-align: top;
      }
      .bs-table__caption {
        text-align: left;
        font-weight: 600;
        padding-bottom: 0.5rem;
      }
      .bs-table__details td {
        background: #fafafa;
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
  /** The label for the projected action column; only rendered when `rowActions` is given. */
  readonly actionsLabel = input('Actions');
  /** Whether every row's `rowDetails` template is rendered. */
  readonly expandAll = input(false);

  readonly rowActions = contentChild<TemplateRef<unknown>>('rowActions');
  readonly rowDetails = contentChild<TemplateRef<unknown>>('rowDetails');

  /** Every column plus the action column when one is projected — the detail/empty span. */
  readonly columnCount = () => this.columns().length + (this.rowActions() ? 1 : 0);

  rowKey(row: Record<string, unknown>): unknown {
    return row[this.trackKey()];
  }

  cell(row: Record<string, unknown>, key: string): unknown {
    return row[key];
  }
}

export type { ITableColumn };
