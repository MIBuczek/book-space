import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorStore } from '../../core/error.store';

/**
 * The server-error page.
 *
 * It reads the message the error interceptor or the error boundary recorded, so
 * the user sees the same failure the code saw rather than a generic string. The
 * detail is the HTTP status text or a handler message, never a stack trace or a
 * driver message — the API already guarantees a 5xx carries no cause.
 */
@Component({
  selector: 'book-space-server-error',
  imports: [RouterLink],
  template: `
    <section class="bs-page">
      <h1>Something went wrong</h1>
      <p>{{ errors.serverError() ?? 'The server is unavailable.' }}</p>
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
export class ServerErrorComponent {
  readonly errors = inject(ErrorStore);
}
