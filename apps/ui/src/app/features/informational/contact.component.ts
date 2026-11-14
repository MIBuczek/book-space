import { Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TenantStore } from '../../core/tenant.store';

/** One opening-hours line, as the catalogue declares it. */
interface IHoursEntry {
  day: string;
  hours: string;
}

/** One contact block: the label lines and the dial/e-mail targets. */
interface IContactBlock {
  address: string;
  phone: string;
  phoneHref: string;
}

/**
 * The contact page (FR-039, issue #44).
 *
 * Three columns, as the legacy `Contact.tsx` had: the registered office, the correspondence
 * address, and the person to contact about a booking. The headings are translated through the
 * pipe (FR-001); the blocks and the opening-hours list are read through `instant`, because
 * `instant` reads the service's own signals so a `computed` that calls it re-fills on a language
 * switch.
 *
 * The office **e-mail** and **website** are the tenant's configured contact details (FR-007),
 * not catalogue values: they come from `GET /api/tenant`, and an absent one hides its line
 * rather than rendering an empty `mailto:` or a link with no destination (SC-005). The postal
 * address, the phone and the opening hours are not tenant settings, so they stay in the
 * catalogue as the deployment's sample content.
 */
@Component({
  selector: 'book-space-contact',
  imports: [TranslatePipe],
  template: `
    <main class="bs-contact">
      <section class="bs-contact__column">
        <h2>{{ 'contact.registeredOfficeHeading' | translate }}</h2>
        <p class="bs-contact__strong">{{ office().name }}</p>
        <p>{{ office().address }}</p>
        <h3>{{ 'contact.hoursHeading' | translate }}</h3>
        <p>
          @for (entry of hours(); track entry.day) {
            {{ entry.day }}: {{ entry.hours }}<br />
          }
        </p>
      </section>

      <section class="bs-contact__column">
        <h2>{{ 'contact.officeHeading' | translate }}</h2>
        <p>{{ contact().address }}</p>
        <p>
          <a [href]="contact().phoneHref">{{ 'common.phonePrefix' | translate }}{{ contact().phone }}</a>
        </p>
        @if (contactEmail(); as email) {
          <p>
            <a [href]="'mailto:' + email">{{ email }}</a>
          </p>
        }
        @if (websiteUrl(); as site) {
          <p>
            <a [href]="site">{{ site }}</a>
          </p>
        }
      </section>

      <section class="bs-contact__column">
        <h2>{{ 'contact.bookingHeading' | translate }}</h2>
        <p class="bs-contact__strong">{{ booking().name }}</p>
        <p class="bs-contact__small">{{ booking().role }}</p>
        <p>
          <a [href]="booking().phoneHref">{{ 'common.phonePrefix' | translate }}{{ booking().phone }}</a>
        </p>
        <p>
          <a [href]="'mailto:' + booking().email">{{ booking().email }}</a>
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
  private readonly translate = inject(TranslateService);
  private readonly tenants = inject(TenantStore);

  // The blocks and the hours list are objects and arrays, so they are read through `instant`
  // rather than the pipe. Each `computed` tracks the service's signals, so a switch re-fills it.
  readonly office = computed(() => ({
    name: this.translate.instant('contact.registeredOffice.name'),
    address: this.translate.instant('contact.registeredOffice.address'),
  }));

  readonly contact = computed<IContactBlock>(() => ({
    address: this.translate.instant('contact.office.address'),
    phone: this.translate.instant('contact.office.phone'),
    phoneHref: this.translate.instant('contact.office.phoneHref'),
  }));

  /** The tenant's contact address, or `null` when the deployment has not set one. */
  readonly contactEmail = computed(() => this.tenants.tenant()?.contactEmail ?? null);
  readonly websiteUrl = computed(() => this.tenants.tenant()?.websiteUrl ?? null);

  readonly booking = computed(() => ({
    name: this.translate.instant('contact.bookingContact.name'),
    role: this.translate.instant('contact.bookingContact.role'),
    phone: this.translate.instant('contact.bookingContact.phone'),
    phoneHref: this.translate.instant('contact.bookingContact.phoneHref'),
    email: this.translate.instant('contact.bookingContact.email'),
  }));

  readonly hours = computed(
    () => this.translate.instant('contact.hours') as unknown as IHoursEntry[]
  );
}
