import { Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from './button.component';

/**
 * Page navigation over a known total.
 *
 * `page` is one-based, matching the API's `page` query parameter, so a caller
 * passes it straight through with no off-by-one at the boundary. `pageCount` is
 * derived here rather than asked of the caller, because two places computing the
 * same ceiling is how the last page ends up empty.
 */
@Component({
  selector: 'book-space-pagination',
  imports: [ButtonComponent],
  template: `
    <nav class="bs-pagination" aria-label="Pagination">
      <book-space-button
        variant="secondary"
        [disabled]="page() <= 1"
        (pressed)="goTo(page() - 1)"
      >
        Previous
      </book-space-button>
      <span class="bs-pagination__status">Page {{ page() }} of {{ pageCount() }}</span>
      <book-space-button
        variant="secondary"
        [disabled]="page() >= pageCount()"
        (pressed)="goTo(page() + 1)"
      >
        Next
      </book-space-button>
    </nav>
  `,
  styles: [
    `
      .bs-pagination {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
    `,
  ],
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly limit = input.required<number>();
  readonly pageChange = output<number>();

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));

  goTo(page: number): void {
    if (page >= 1 && page <= this.pageCount()) {
      this.pageChange.emit(page);
    }
  }
}
