import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorStore } from '../../core/error.store';
import { TenantStore } from '../../core/tenant.store';

/**
 * The server-error page (FR-039, issue #44).
 *
 * It reads the message the error interceptor or the error boundary recorded, so
 * the user sees the same failure the code saw rather than a generic string. The
 * detail is the HTTP status text or a handler message, never a stack trace or a
 * driver message — the API already guarantees a 5xx carries no cause.
 *
 * The contact block reuses the office phone from the catalogue (FR-001) and the tenant's
 * configured contact address (FR-007); an unset address hides its line rather than rendering an
 * empty `mailto:` (SC-005). The legacy `ServerError.tsx` linked `tel:+48718890023` but labelled
 * it with an envelope icon and printed a phone number; here the link is labelled as a phone
 * link, so what it does and what it says agree.
 */
@Component({
  selector: 'book-space-server-error',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main class="bs-server-error">
      <h1>{{ 'serverError.title' | translate }}</h1>
      <p>{{ errors.serverError() ?? ('serverError.fallback' | translate) }}</p>
      <p>{{ 'serverError.prompt' | translate }}</p>
      <p>
        <a [href]="contact.phoneHref">{{ 'common.phonePrefix' | translate }}{{ contact.phone }}</a>
      </p>
      @if (contactEmail(); as email) {
        <p>
          <a [href]="'mailto:' + email">{{ email }}</a>
        </p>
      }
      <a routerLink="/">{{ 'common.backToCalendar' | translate }}</a>
    </main>
  `,
  styles: [
    `
      .bs-server-error {
        max-width: 630px;
        margin: 14vh auto 0;
        padding: 0 1.5rem;
        text-align: center;
      }
    `,
  ],
})
export class ServerErrorComponent {
  private readonly translate = inject(TranslateService);
  private readonly tenants = inject(TenantStore);
  readonly errors = inject(ErrorStore);
  readonly contact = {
    phone: this.translate.instant('contact.office.phone'),
    phoneHref: this.translate.instant('contact.office.phoneHref'),
  };
  readonly contactEmail = computed(() => this.tenants.tenant()?.contactEmail ?? null);
}
