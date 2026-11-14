import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { APP_VERSION } from '@booking/version';
import { DEFAULT_TENANT_NAME } from '@models/tenant.model';
import { TenantStore } from '../core/tenant.store';

/**
 * The footer shared by every page (FR-039, issue #44).
 *
 * Carries the privacy-policy link, the product site link and the application version, as the
 * legacy `Footer.tsx` did. The version is the same value the server reports on `GET /api`
 * (`@booking/version`), so an operator can match a running UI to a deployed API build.
 *
 * The brand and the two links come from the tenant identity (`GET /api/tenant`, FR-007), so a
 * rebrand is a server setting and the bundle carries no tenant's name or URL. An absent value
 * hides its element rather than rendering an empty link (SC-005), and until the read resolves
 * the brand falls back to the product name.
 *
 * The text is read through the translate pipe (FR-001), and the version and the tenant name are
 * interpolation parameters, so the footer re-renders on a language switch.
 */
@Component({
  selector: 'book-space-footer',
  imports: [TranslatePipe],
  template: `
    <footer class="bs-footer">
      <nav class="bs-footer__links" [attr.aria-label]="'footer.ariaLabel' | translate">
        @if (privacyUrl(); as privacy) {
          <a [href]="privacy" target="_blank" rel="noopener">{{ 'footer.privacy' | translate }}</a>
        }
        @if (websiteUrl(); as site) {
          <a [href]="site" target="_blank" rel="noopener">
            {{ 'footer.site' | translate: { tenant: brand() } }}
          </a>
        }
      </nav>
      <p class="bs-footer__meta">
        {{ 'footer.meta' | translate: { tenant: brand(), version: version } }}
      </p>
      <p class="bs-footer__copyright">{{ 'footer.copyright' | translate }}</p>
    </footer>
  `,
  styles: [
    `
      .bs-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: auto;
        padding: 1rem 1.5rem;
        border-top: 1px solid #d9d9d9;
        color: #5a5a5a;
        font-size: 0.875rem;
      }
      .bs-footer__links {
        display: flex;
        gap: 1rem;
      }
      .bs-footer__meta {
        margin: 0;
      }
      .bs-footer__copyright {
        flex-basis: 100%;
        margin: 0;
      }
    `,
  ],
})
export class FooterComponent {
  private readonly tenants = inject(TenantStore);

  /** The configured brand, or the product name until the tenant read resolves. */
  readonly brand = computed(() => this.tenants.tenant()?.name ?? DEFAULT_TENANT_NAME);
  readonly version = APP_VERSION;
  readonly privacyUrl = computed(() => this.tenants.tenant()?.privacyUrl ?? null);
  readonly websiteUrl = computed(() => this.tenants.tenant()?.websiteUrl ?? null);
}
