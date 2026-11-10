import { Component, inject } from '@angular/core';
import { COPY } from '@booking/copy';
import { CookieNoticeStore } from '../../core/cookie-notice.store';

/**
 * The cookie notice (FR-039, FR-040, issue #44).
 *
 * A fixed panel that hides once acknowledged and stays hidden on reload. It is
 * rendered by the shell so it appears on every page, matching the legacy
 * `Cookies.tsx`, which was mounted once at the app root. The persistence lives in
 * `CookieNoticeStore`, which stores the acknowledgement as `'true'` rather than
 * the legacy `'false'`.
 *
 * The text comes from the shared copy catalogue (NFR-005, T061).
 */
@Component({
  selector: 'book-space-cookie-notice',
  template: `
    @if (!cookies.acknowledged()) {
      <aside class="bs-cookies" [attr.aria-label]="copy.ariaLabel">
        <h2 class="bs-cookies__header">{{ copy.heading }}</h2>
        <p class="bs-cookies__text">
          {{ copy.text }}
          <a [href]="privacyUrl" target="_blank" rel="noopener">{{ copy.learnMore }}</a>
        </p>
        <button type="button" class="bs-cookies__accept" (click)="cookies.acknowledge()">
          {{ copy.accept }}
        </button>
      </aside>
    }
  `,
  styles: [
    `
      .bs-cookies {
        position: fixed;
        right: 20px;
        bottom: 6%;
        z-index: 100;
        width: 260px;
        padding: 15px 20px;
        border-radius: 3px;
        background: #fff;
        box-shadow: 0 3px 9px 0 rgb(0 0 0 / 40%);
      }
      .bs-cookies__header {
        margin: 5px 0 0;
        font-size: 24px;
        font-weight: 400;
      }
      .bs-cookies__text {
        margin: 0;
        color: #444;
        font-size: 14px;
        line-height: 1.4;
      }
      .bs-cookies__accept {
        margin-top: 0.75rem;
        padding: 0.4rem 0.9rem;
        border: none;
        border-radius: 3px;
        background: #2f6f3e;
        color: #fff;
        font: inherit;
        cursor: pointer;
      }
    `,
  ],
})
export class CookieNoticeComponent {
  readonly copy = COPY.cookieNotice;
  readonly cookies = inject(CookieNoticeStore);
  readonly privacyUrl = COPY.contact.privacyPolicyUrl;
}
