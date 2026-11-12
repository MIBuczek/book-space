import { Component, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { APP_VERSION } from '@booking/version';

/**
 * The footer shared by every page (FR-039, issue #44).
 *
 * Carries the privacy-policy link, the product site link and the application version, as the
 * legacy `Footer.tsx` did. The version is the same value the server reports on `GET /api`
 * (`@booking/version`), so an operator can match a running UI to a deployed API build.
 *
 * The text is read through the translate pipe (FR-001), and the version and the tenant name are
 * interpolation parameters, so the footer re-renders on a language switch. The site and privacy
 * links are configuration values in the catalogue until the tenant endpoint lands (T252), which
 * is why they are read with `instant` rather than bound to a component field.
 */
@Component({
  selector: 'book-space-footer',
  imports: [TranslatePipe],
  template: `
    <footer class="bs-footer">
      <nav class="bs-footer__links" [attr.aria-label]="'footer.ariaLabel' | translate">
        <a [href]="privacyUrl" target="_blank" rel="noopener">{{ 'footer.privacy' | translate }}</a>
        <a [href]="websiteUrl" target="_blank" rel="noopener">
          {{ 'footer.site' | translate: { tenant: brand } }}
        </a>
      </nav>
      <p class="bs-footer__meta">
        {{ 'footer.meta' | translate: { tenant: brand, version: version } }}
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
  private readonly translate = inject(TranslateService);

  /** The product name, an interpolation parameter until the tenant endpoint lands (T252). */
  readonly brand = 'Book Space';
  readonly version = APP_VERSION;
  readonly privacyUrl = this.translate.instant('contact.privacyPolicyUrl');
  readonly websiteUrl = this.translate.instant('contact.websiteUrl');
}
