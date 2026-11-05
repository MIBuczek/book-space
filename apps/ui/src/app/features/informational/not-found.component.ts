import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The 404 page.
 *
 * It offers a link back to the calendar rather than relying on the browser's
 * back button, which is what the legacy `NoMatch` did.
 */
@Component({
  selector: 'book-space-not-found',
  imports: [RouterLink],
  template: `
    <section class="bs-page">
      <h1>Page not found</h1>
      <p>The page you asked for does not exist.</p>
      <a routerLink="/">Back to the calendar</a>
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1.5rem;
      }
    `,
  ],
})
export class NotFoundComponent {}
