import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COPY } from '@booking/copy';

/**
 * The 404 page (FR-039, issue #44).
 *
 * It offers a link back to the calendar rather than relying on the browser's
 * back button, which is what the legacy `NoMatch` did. The copy comes from the
 * shared catalogue (NFR-005, T061).
 */
@Component({
  selector: 'book-space-not-found',
  imports: [RouterLink],
  template: `
    <main class="bs-not-found">
      <h1>{{ copy.title }}</h1>
      <p>{{ copy.code }}</p>
      <a routerLink="/">{{ common.backToCalendar }}</a>
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
export class NotFoundComponent {
  readonly copy = COPY.notFound;
  readonly common = COPY.common;
}
