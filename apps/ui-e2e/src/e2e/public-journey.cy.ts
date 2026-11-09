import {calendar, nav} from '../support/app.po';

/**
 * US1 — a public visitor browses availability and requests a booking (P1, NFR-004).
 *
 * The journey runs against the real API and database: the calendar's events come from
 * `GET /bookings`, which redacts the tenant's personal fields for an anonymous caller, and the
 * request is a real `POST /bookings` the server stores unapproved. Mocking either would test
 * the mock — the redaction and the "created unapproved" rule are properties of the whole
 * request, which is exactly what an end-to-end test is for.
 */
describe('US1 — a public visitor browses the calendar and requests a booking', () => {
  beforeEach(() => {
    cy.resetBackend();
    cy.visit('/');
  });

  it('shows only the accepted bookings, with the tenant details redacted', () => {
    calendar.heading().should('contain', 'Kalendarz rezerwacji obiektów');

    // The accepted fixture is on the calendar; the unaccepted one is not, because the public
    // filter forces `accepted: true` server-side rather than trusting a query parameter.
    calendar.event('E2E Kalendarz').should('exist');
    cy.contains('.bs-event', 'E2E Do zatwierdzenia').should('not.exist');

    // The public notice is shown to an anonymous caller and the tenant's name is not.
    calendar.publicNotice().should('contain', 'zatwierdzone przez administratora');
    cy.contains('.bs-event', 'Kalendarz Publiczny').should('not.exist');
  });

  it('opens the booking request form and refuses to submit without the RODO clause', () => {
    nav.link('Rezerwacja').click();
    cy.location('pathname').should('eq', '/booking-request');
    cy.get('h1').should('contain', 'Prośba o rezerwację');

    // The submit button is disabled until the RODO box is ticked, even before any field is
    // filled: the acknowledgement gates submission on its own (acceptance scenario 3).
    cy.contains('button', 'Wyślij prośbę o rezerwację').should('be.disabled');
  });

  it('submits a request that the server stores unapproved', () => {
    nav.link('Rezerwacja').click();

    cy.selectByLabel('Miasto', 'siechnice');
    cy.selectByLabel('Obiekt', 'hala-sportowa');
    cy.selectByLabel('Rozmiar', '1/1');
    cy.selectByLabel('Typ', 'Osoba prywatna');
    cy.typeByLabel('Nazwa w kalendarzu', 'E2E Nowa Prośba');
    cy.typeByLabel('Imię i nazwisko', 'Jan Nowak');
    cy.typeByLabel('E-mail', 'jan.nowak@example.com');
    cy.typeByLabel('Telefon', '600700800');
    cy.selectByLabel('Płatność', 'Przelew');

    // One slot, today, 09:00–10:00.
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    cy.setDateByLabel('Dzień', iso);
    cy.selectByLabel('Od godziny', '9');
    cy.selectByLabel('Do godziny', '10');
    cy.contains('button', 'Dodaj termin').click();

    cy.checkByLabel('Akceptuję klauzulę informacyjną RODO');
    cy.contains('button', 'Wyślij prośbę o rezerwację').should('not.be.disabled').click();

    cy.get('.bs-request__success').should('contain', 'oczekuje na zatwierdzenie');

    // The record reached the database, unapproved and unarchived — the server's decision, not
    // the form's. This is the assertion a mocked API could not make.
    cy.task<Record<string, unknown> | null>('backend:findBookingByNick', 'E2E Nowa Prośba').then(
      (booking) => {
        expect(booking, 'the submitted booking is stored').to.not.equal(null);
        expect(booking).to.include({accepted: false, archive: false});
      }
    );
  });
});
