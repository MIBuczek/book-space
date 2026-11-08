import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The 404 page (FR-039, issue #44).
 *
 * It offers a link back to the calendar rather than relying on the browser's
 * back button, which is what the legacy `NoMatch` did.
 */
@Component({
  selector: 'book-space-not-found',
  imports: [RouterLink],
  template: `
    <main class="bs-not-found">
      <h1>Strona nie istnieje</h1>
      <p>Błąd 404</p>
      <a routerLink="/">Powrót do kalendarza rezerwacji</a>
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
