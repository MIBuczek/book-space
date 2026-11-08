import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_VERSION } from '@booking/version';
import { PRIVACY_POLICY_URL, SISK_WEBSITE_URL } from '../features/informational/contact-details';

/**
 * The footer shared by every page (FR-039, issue #44).
 *
 * Carries the privacy-policy link, the SISK site link and the application
 * version, as the legacy `Footer.tsx` did. The version is the same value the
 * server reports on `GET /api` (`@booking/version`), so an operator can match a
 * running UI to a deployed API build.
 */
@Component({
  selector: 'book-space-footer',
  imports: [RouterLink],
  template: `
    <footer class="bs-footer">
      <nav class="bs-footer__links" aria-label="Informacje">
        <a [href]="privacyUrl" target="_blank" rel="noopener">Polityka prywatności</a>
        <a [href]="siskUrl" target="_blank" rel="noopener">Strona SISK</a>
      </nav>
      <p class="bs-footer__meta">
        SISK Siechnice — system rezerwacji · Wersja aplikacji {{ version }}
      </p>
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
  readonly version = APP_VERSION;
  readonly privacyUrl = PRIVACY_POLICY_URL;
  readonly siskUrl = SISK_WEBSITE_URL;
}
