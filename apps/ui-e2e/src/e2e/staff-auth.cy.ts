import {admin, nav, signIn} from '../support/app.po';

/**
 * US2 — a staff member signs in, lands on the admin panel, sees role-appropriate tabs and
 * signs out (P1, NFR-004).
 *
 * The tabs come from the capabilities the API resolves (`GET /auth/me`, the sign-in body), not
 * from a role re-derived in the client, so this journey is what proves the server's answer
 * reaches the navigation. An employee sees the two staff tabs; an office account adds Clients,
 * Facilities and Summary; an administrator adds the same three (it is not on the deny-list).
 */
describe('US2 — staff authentication and role-based navigation', () => {
  beforeEach(() => {
    cy.resetBackend();
  });

  it('signs an employee in and offers only the staff tabs', () => {
    cy.signIn('employee@example.com', 'password123');

    nav.userEmail().should('contain', 'employee@example.com');
    admin.tabs().should('have.length', 2);
    admin.tab('Calendar').should('exist');
    admin.tab('Bookings').should('exist');
    admin.tab('Clients').should('not.exist');
    admin.tab('Summary').should('not.exist');
  });

  it('offers an office account the client, facility and summary tabs', () => {
    cy.signIn('office@example.com', 'password123');

    admin.tab('Clients').should('exist');
    admin.tab('Facilities').should('exist');
    admin.tab('Summary').should('exist');
  });

  it('offers an administrator the summary tab and the approve controls', () => {
    cy.signIn('admin@example.com', 'password123');

    admin.tab('Summary').should('exist');

    admin.tab('Bookings').click();
    cy.contains('h1', 'Lista rezerwacji').should('exist');
    // The approve control is administrator-only; the capability, not the role, decides it.
    cy.contains('button', 'Zatwierdź').should('exist');
  });

  it('rejects a wrong password with the server single message and stays on the form', () => {
    cy.visit('/sign-in');
    cy.typeByLabel('E-mail', 'admin@example.com');
    cy.typeByLabel('Password', 'wrong-password');
    signIn.submit().click();

    signIn.error().should('contain', 'Invalid e-mail or password');
    cy.location('pathname').should('include', '/sign-in');
  });

  it('keeps an anonymous caller out of the admin area', () => {
    cy.visit('/admin');

    // `authGuard` redirects a caller with no session to sign-in before the admin chunk loads.
    cy.location('pathname').should('include', '/sign-in');
  });

  it('signs the caller out and clears the session', () => {
    cy.signIn('admin@example.com', 'password123');

    admin.signOut().click();
    cy.location('pathname').should('eq', '/');
    nav.signInLink().should('exist');

    // The admin area is refused again once the session is gone.
    cy.visit('/admin');
    cy.location('pathname').should('include', '/sign-in');
  });
});
