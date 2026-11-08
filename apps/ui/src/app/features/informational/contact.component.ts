import { Component } from '@angular/core';
import {
  BOOKING_CONTACT,
  OFFICE_CONTACT,
  OFFICE_HOURS,
  REGISTERED_OFFICE,
} from './contact-details';

/**
 * The contact page (FR-039, issue #44).
 *
 * Three columns, as the legacy `Contact.tsx` had: the registered office, the
 * correspondence address, and the person to contact about a booking. The details
 * live in `contact-details.ts` so the server-error page and the footer reuse the
 * office phone and e-mail rather than repeating them.
 */
@Component({
  selector: 'book-space-contact',
  template: `
    <main class="bs-contact">
      <section class="bs-contact__column">
        <h2>Dane teleadresowe</h2>
        <p class="bs-contact__strong">{{ office.name }}</p>
        <p>{{ office.address }}</p>
        <h3>Godziny przyjęć interesantów:</h3>
        <p>
          @for (entry of hours; track entry.day) {
            {{ entry.day }}: {{ entry.hours }}<br />
          }
        </p>
      </section>

      <section class="bs-contact__column">
        <h2>Biuro / Adres korespondencyjny</h2>
        <p>{{ contact.address }}</p>
        <p>
          <a [href]="contact.phoneHref">tel. {{ contact.phone }}</a>
        </p>
        <p>
          <a [href]="'mailto:' + contact.email">{{ contact.email }}</a>
        </p>
        <p>
          <a [href]="contact.websiteHref">{{ contact.website }}</a>
        </p>
      </section>

      <section class="bs-contact__column">
        <h2>Osoba do kontaktu w sprawie rezerwacji</h2>
        <p class="bs-contact__strong">{{ booking.name }}</p>
        <p class="bs-contact__small">{{ booking.role }}</p>
        <p>
          <a [href]="booking.phoneHref">tel. {{ booking.phone }}</a>
        </p>
        <p>
          <a [href]="'mailto:' + booking.email">{{ booking.email }}</a>
        </p>
      </section>
    </main>
  `,
  styles: [
    `
      .bs-contact {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-evenly;
        max-width: 1470px;
        margin: 5vh auto 0;
        padding: 0 1.5rem;
      }
      .bs-contact__column {
        flex: 1 1 260px;
        max-width: 420px;
        padding: 2rem 1.5rem;
      }
      .bs-contact__strong {
        font-weight: 700;
      }
      .bs-contact__small {
        font-size: 0.875rem;
      }
      @media (max-width: 890px) {
        .bs-contact {
          flex-direction: column;
          align-items: center;
        }
      }
    `,
  ],
})
export class ContactComponent {
  readonly office = REGISTERED_OFFICE;
  readonly contact = OFFICE_CONTACT;
  readonly booking = BOOKING_CONTACT;
  readonly hours = OFFICE_HOURS;
}
