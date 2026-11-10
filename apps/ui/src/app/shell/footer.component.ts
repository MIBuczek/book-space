import { Component } from '@angular/core';
import { APP_VERSION } from '@booking/version';
import { COPY } from '@booking/copy';

/**
 * The footer shared by every page (FR-039, issue #44).
 *
 * Carries the privacy-policy link, the SISK site link and the application
 * version, as the legacy `Footer.tsx` did. The version is the same value the
 * server reports on `GET /api` (`@booking/version`), so an operator can match a
 * running UI to a deployed API build.
 *
 * The copy is read from the shared catalogue (`@booking/copy`), which is the only
 * source of user-facing Polish text (NFR-005, T061); the version is interpolated
 * by `COPY.footer.meta`.
 */
@Component({
  selector: 'book-space-footer',
  template: `
    <footer class="bs-footer">
      <nav class="bs-footer__links" [attr.aria-label]="copy.ariaLabel">
        <a [href]="privacyUrl" target="_blank" rel="noopener">{{ copy.privacy }}</a>
        <a [href]="siskUrl" target="_blank" rel="noopener">{{ copy.site }}</a>
      </nav>
      <p class="bs-footer__meta">{{ meta }}</p>
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
    `,
  ],
})
export class FooterComponent {
  readonly copy = COPY.footer;
  readonly meta = COPY.footer.meta(APP_VERSION);
  readonly privacyUrl = COPY.contact.privacyPolicyUrl;
  readonly siskUrl = COPY.contact.siskWebsiteUrl;
}
