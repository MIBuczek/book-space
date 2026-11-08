import {PUBLIC_BUILDINGS, paginated, publicBooking, slot} from '../support/fixtures';

/**
 * User Story 1 (P1) — a public visitor browses availability and requests a booking.
 *
 * The journey runs against the built UI with every API response stubbed, so it exercises the
 * real routes, guards, components and HTTP clients without needing a database. Each
 * acceptance scenario from `spec.md` §"User Story 1" is a test below.
 *
 * The calendar's anchor is `now`, so the specs derive the day they expect to see rather than
 * hard-coding one; a fixture booked on a fixed date would fall outside the loaded week for
 * most of the year and the "only accepted bookings appear" assertion would pass vacuously.
 */
describe('US1 — public visitor', () => {
  /** The facility-local day `now` sits on, which the calendar's default week contains. */
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    cy.intercept('GET', '/api/buildings', PUBLIC_BUILDINGS).as('buildings');
    cy.intercept('GET', '/api/bookings*', {statusCode: 200, body: paginated([])}).as('bookings');
  });

  it('shows the facility selectors and the public notice', () => {
    cy.visit('/');

    cy.wait('@buildings');
    cy.contains('.bs-field__label', 'Miasto').should('exist');
    cy.contains('.bs-field__label', 'Obiekt').should('exist');
    cy.contains('h1', 'Kalendarz rezerwacji obiektów').should('exist');
    cy.contains(
      'W kalendarzu są widoczne tylko zatwierdzone przez administratora rezerwacje.'
    ).should('exist');
  });

  it('renders only the accepted bookings the API returned', () => {
    // The server redacts and filters; the client renders what it is given. This asserts the
    // client does not invent an event, and that a public booking shows the calendar nickname
    // rather than the (absent) tenant name.
    cy.intercept('GET', '/api/bookings*', {
      statusCode: 200,
      body: paginated([publicBooking({bookedTimes: [slot(today, 9, 11)]})]),
    }).as('accepted');

    cy.visit('/');
    cy.wait('@buildings');
    cy.wait('@accepted');

    cy.get('.bs-event').should('have.length', 1);
    cy.get('.bs-event').should('contain.text', 'Klub Sportowy');
    cy.get('.bs-event').should('contain.text', 'Zatwierdzona');
  });

  it('hides a cancelled slot even when the booking is accepted', () => {
    cy.intercept('GET', '/api/bookings*', {
      statusCode: 200,
      body: paginated([publicBooking({bookedTimes: [slot(today, 9, 11, 'CANCELED')]})]),
    }).as('cancelled');

    cy.visit('/');
    cy.wait('@buildings');
    cy.wait('@cancelled');

    cy.get('.bs-event').should('have.length', 0);
  });

  it('keeps the submit button disabled until the RODO clause is accepted', () => {
    cy.visit('/booking-request');
    cy.wait('@buildings');

    // A slot is required before the button can ever enable, so add one first.
    cy.field('Dzień').find('input').clear();
    cy.field('Dzień').find('input').type(today);
    cy.contains('button', 'Dodaj termin').click();

    cy.contains('button', 'Wyślij prośbę o rezerwację').should('be.disabled');

    cy.checkBox('Akceptuję klauzulę informacyjną RODO').find('input').check();
    cy.contains('button', 'Wyślij prośbę o rezerwację').should('not.be.disabled');
  });

  it('prevents selecting a past day in the date picker', () => {
    cy.visit('/booking-request');
    cy.wait('@buildings');

    cy.field('Dzień')
      .find('input')
      .then(($input) => {
        // The minimum is today in the facility's calendar, so a past date cannot be chosen.
        expect($input.attr('min')).to.eq(today);
      });
  });

  it('submits a valid request and shows the confirmation', () => {
    cy.intercept('POST', '/api/bookings', {
      statusCode: 201,
      body: publicBooking({accepted: false, bookedTimes: [slot(today, 9, 11)]}),
    }).as('create');

    cy.visit('/booking-request');
    cy.wait('@buildings');

    cy.field('Nazwa w kalendarzu').find('input').type('Klub Sportowy');
    cy.field('Imię i nazwisko').find('input').type('Jan Kowalski');
    cy.field('E-mail').find('input').type('jan@example.com');
    cy.field('Telefon').find('input').type('600100200');
    cy.field('Dzień').find('input').clear();
    cy.field('Dzień').find('input').type(today);
    cy.contains('button', 'Dodaj termin').click();
    cy.checkBox('Akceptuję klauzulę informacyjną RODO').find('input').check();
    cy.contains('button', 'Wyślij prośbę o rezerwację').click();

    cy.wait('@create')
      .its('request.body')
      .then((body) => {
        expect(body).to.include({nick: 'Klub Sportowy', personName: 'Jan Kowalski'});
        expect(body).to.have.property('rodoAcknowledgement', true);
        // The server decides approval; the request must not claim it.
        expect(body).not.to.have.property('accepted');
      });

    cy.contains('Twoja prośba o rezerwację została wysłana').should('exist');
  });

  it('refuses to submit an invalid form and names the field', () => {
    cy.visit('/booking-request');
    cy.wait('@buildings');

    // Fill everything except a valid e-mail; the form must block the submit client-side.
    cy.field('Nazwa w kalendarzu').find('input').type('Klub Sportowy');
    cy.field('Imię i nazwisko').find('input').type('Jan Kowalski');
    cy.field('E-mail').find('input').type('not-an-email');
    cy.field('Telefon').find('input').type('600100200');
    cy.field('Dzień').find('input').clear();
    cy.field('Dzień').find('input').type(today);
    cy.contains('button', 'Dodaj termin').click();
    cy.checkBox('Akceptuję klauzulę informacyjną RODO').find('input').check();
    cy.contains('button', 'Wyślij prośbę o rezerwację').click();

    cy.contains('Podaj poprawny adres e-mail').should('exist');
    cy.contains('Twoja prośba o rezerwację została wysłana').should('not.exist');
  });
});
