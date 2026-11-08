import {
  PUBLIC_BUILDINGS,
  administrator,
  employee,
  officeUser,
  paginated,
} from '../support/fixtures';

/**
 * User Story 2 (P1) — staff authenticates and sees their facility workspace.
 *
 * Every scenario from `spec.md` §"User Story 2" is a test below. The API is stubbed, so the
 * sign-in response carries a capability matrix the spec chose; the point under test is that the
 * *client* renders the navigation from those capabilities and enforces the guards, not that the
 * server computed them (that is the server integration suite's job).
 */
describe('US2 — staff sign-in and role-based navigation', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/buildings', PUBLIC_BUILDINGS).as('buildings');
    cy.intercept('GET', '/api/bookings*', {statusCode: 200, body: paginated([])}).as('bookings');
  });

  it('signs in with valid credentials and lands on the admin area', () => {
    cy.intercept('POST', '/api/auth/sign-in', {
      statusCode: 201,
      body: {user: administrator(), token: 'token-admin'},
    }).as('signIn');

    cy.visit('/sign-in');
    cy.field('E-mail').find('input').type('admin@example.com');
    cy.field('Password').find('input').type('secret123');
    cy.contains('button', 'Sign in').click();

    cy.wait('@signIn');
    cy.location('pathname').should('eq', '/admin/calendar');
    cy.contains('a', 'Clients').should('exist');
  });

  it('shows the single rejection message on invalid credentials', () => {
    cy.intercept('POST', '/api/auth/sign-in', {
      statusCode: 401,
      body: {statusCode: 401, message: 'Invalid e-mail or password'},
    }).as('signIn');

    cy.visit('/sign-in');
    cy.field('E-mail').find('input').type('nobody@example.com');
    cy.field('Password').find('input').type('wrong-password');
    cy.contains('button', 'Sign in').click();

    cy.wait('@signIn');
    // One message for every rejection: the client must not invent a distinction.
    cy.get('[role="alert"]').should('contain.text', 'Invalid e-mail or password');
    cy.location('pathname').should('eq', '/sign-in');
  });

  it('shows an employee only the Calendar and Bookings tabs', () => {
    cy.intercept('POST', '/api/auth/sign-in', {
      statusCode: 201,
      body: {user: employee(), token: 'token-employee'},
    }).as('signIn');

    cy.visit('/sign-in');
    cy.field('E-mail').find('input').type('employee@example.com');
    cy.field('Password').find('input').type('secret123');
    cy.contains('button', 'Sign in').click();

    cy.wait('@signIn');
    cy.location('pathname').should('eq', '/admin/calendar');
    cy.get('.bs-admin__tabs a').then(($links) => {
      const labels = Array.from($links, (a) => a.textContent?.trim());
      expect(labels).to.deep.eq(['Calendar', 'Bookings']);
    });
  });

  it('shows an office user the Clients, Facilities and Summary tabs', () => {
    cy.intercept('POST', '/api/auth/sign-in', {
      statusCode: 201,
      body: {user: officeUser(), token: 'token-office'},
    }).as('signIn');

    cy.visit('/sign-in');
    cy.field('E-mail').find('input').type('office@example.com');
    cy.field('Password').find('input').type('secret123');
    cy.contains('button', 'Sign in').click();

    cy.wait('@signIn');
    cy.get('.bs-admin__tabs a').then(($links) => {
      const labels = Array.from($links, (a) => a.textContent?.trim());
      expect(labels).to.deep.eq(['Calendar', 'Bookings', 'Clients', 'Facilities', 'Summary']);
    });
  });

  it('redirects an unauthenticated visitor from /admin to sign-in', () => {
    cy.visit('/admin');

    cy.location('pathname').should('eq', '/sign-in');
    cy.contains('h1', 'Sign in').should('exist');
  });

  it('redirects a signed-in employee away from a tab they lack', () => {
    cy.intercept('GET', '/api/auth/me', employee()).as('me');
    visitWithSession('/admin/clients', employee(), 'token-employee');

    // A signed-in caller who lacks the capability goes to the calendar, not to sign-in.
    cy.location('pathname').should('eq', '/');
  });

  it('redirects a signed-in caller away from the sign-in page', () => {
    cy.intercept('GET', '/api/auth/me', administrator()).as('me');
    visitWithSession('/sign-in', administrator(), 'token-admin');

    cy.location('pathname').should('eq', '/admin/calendar');
  });

  it('signs out, clearing the session and returning to the calendar', () => {
    cy.intercept('POST', '/api/auth/sign-in', {
      statusCode: 201,
      body: {user: administrator(), token: 'token-admin'},
    }).as('signIn');
    cy.intercept('GET', '/api/auth/sign-out', {statusCode: 200, body: {message: 'Signed out'}}).as(
      'signOut'
    );

    cy.visit('/sign-in');
    cy.field('E-mail').find('input').type('admin@example.com');
    cy.field('Password').find('input').type('secret123');
    cy.contains('button', 'Sign in').click();
    cy.wait('@signIn');
    cy.location('pathname').should('eq', '/admin/calendar');

    cy.contains('.bs-nav button', 'Sign out').click();
    cy.wait('@signOut');

    cy.location('pathname').should('eq', '/');
    cy.contains('a', 'Sign in').should('exist');
  });
});

/**
 * Visits `path` with a session already in `localStorage`.
 *
 * `SessionStore` reads the token and user synchronously at construction, so the values have to
 * be present before the app boots. `onBeforeLoad` runs before any script on the page, which is
 * the same mechanism a page reload uses — and it is why this is a `visit` option rather than a
 * second navigation after a plain `visit`.
 */
const visitWithSession = (path: string, user: unknown, token: string): void => {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('book-space.token', token);
      win.localStorage.setItem('book-space.user', JSON.stringify(user));
    },
  });
};
