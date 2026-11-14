import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The 404 page (FR-039, issue #44).
 *
 * It offers a link back to the calendar rather than relying on the browser's
 * back button, which is what the legacy `NoMatch` did. The copy is translated (FR-001).
 */
@Component({
  selector: 'book-space-not-found',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main class="bs-not-found">
      <h1>{{ 'notFound.title' | translate }}</h1>
      <p>{{ 'notFound.code' | translate }}</p>
      <a routerLink="/">{{ 'common.backToCalendar' | translate }}</a>
    </main>
  `,
  styles: [
    `
      .bs-not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 46.5vh;
        margin-top: 5vh;
        padding: 0 1.5rem;
        text-align: center;
      }
    `,
  ],
})
export class NotFoundComponent {}
