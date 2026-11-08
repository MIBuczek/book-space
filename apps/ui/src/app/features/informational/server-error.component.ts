import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorStore } from '../../core/error.store';
import { OFFICE_CONTACT } from './contact-details';

/**
 * The server-error page (FR-039, issue #44).
 *
 * It reads the message the error interceptor or the error boundary recorded, so
 * the user sees the same failure the code saw rather than a generic string. The
 * detail is the HTTP status text or a handler message, never a stack trace or a
 * driver message — the API already guarantees a 5xx carries no cause.
 *
 * The contact block reuses the office phone and e-mail from `contact-details.ts`.
 * The legacy `ServerError.tsx` linked `tel:+48718890023` but labelled it with an
 * envelope icon and printed a phone number; here the link is labelled as a phone
 * link, so what it does and what it says agree.
 */
@Component({
  selector: 'book-space-server-error',
  imports: [RouterLink],
  template: `
    <main class="bs-server-error">
      <h1>Mamy obecnie problem z serwerem</h1>
      <p>{{ errors.serverError() ?? 'Serwer jest niedostępny.' }}</p>
      <p>Zapraszamy do kontaktu telefonicznego lub napisz do nas wiadomość.</p>
      <p>
        <a [href]="contact.phoneHref">tel. {{ contact.phone }}</a>
      </p>
      <p>
        <a [href]="'mailto:' + contact.email">{{ contact.email }}</a>
      </p>
      <a routerLink="/">Powrót do kalendarza rezerwacji</a>
    </main>
  `,
  styles: [
    `
      .bs-server-error {
        max-width: 630px;
        margin: 14vh auto 0;
        padding: 0 1.5rem;
        text-align: center;
      }
    `,
  ],
})
export class ServerErrorComponent {
  readonly errors = inject(ErrorStore);
  readonly contact = OFFICE_CONTACT;
}
