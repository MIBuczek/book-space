import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { injectTranslate } from '@booking/i18n';
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
  imports: [ButtonComponent, TranslatePipe],
  template: `
    <nav class="bs-pagination" [attr.aria-label]="'shared.pagination.ariaLabel' | translate">
      <book-space-button
        variant="secondary"
        [disabled]="page() <= 1"
        (pressed)="goTo(page() - 1)"
      >
        {{ 'shared.pagination.previous' | translate }}
      </book-space-button>
      <span class="bs-pagination__status">{{ status() }}</span>
      <book-space-button
        variant="secondary"
        [disabled]="page() >= pageCount()"
        (pressed)="goTo(page() + 1)"
      >
        {{ 'shared.pagination.next' | translate }}
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
  private readonly t = injectTranslate();
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly limit = input.required<number>();
  readonly pageChange = output<number>();

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));
  readonly status = computed(() =>
    this.t('shared.pagination.status', {page: this.page(), count: this.pageCount()})
  );

  goTo(page: number): void {
    if (page >= 1 && page <= this.pageCount()) {
      this.pageChange.emit(page);
    }
  }
}
