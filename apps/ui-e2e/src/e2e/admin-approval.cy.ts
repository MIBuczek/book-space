import {admin, bookings} from '../support/app.po';

/**
 * US3 — an administrator approves a booking, resolves a slot and archives it (P2, NFR-004).
 *
 * The write routes are administrator-only and each carries a rule the generic update does not
 * run (the approval conflict check, the resolved-slot immutability). Driving them through the
 * table is what proves the UI wires the administrator's controls to those routes, and that the
 * table reflects what the server stored.
 */
describe('US3 — an administrator approves, resolves and archives a booking', () => {
  beforeEach(() => {
    cy.resetBackend();
    cy.signIn('admin@example.com', 'password123');
    admin.tab('Bookings').click();
    cy.contains('h1', 'Lista rezerwacji').should('exist');
  });

  it('lists the facility bookings with the conflict counter', () => {
    bookings.row('E2E Do zatwierdzenia').should('exist');
    bookings.row('E2E Kalendarz').should('exist');
    // The counter is administrator-only and present for the selected facility and period.
    bookings.conflictsCounter().should('contain', 'Aktualna liczba konfliktów');
  });

  it('approves an unapproved booking and reflects the new state', () => {
    bookings
      .row('E2E Do zatwierdzenia')
      .within(() => {
        cy.contains('button', 'Zatwierdź').click();
      });

    // The approve route answers the updated booking and the table reloads; the row now offers
    // the inverse action, which is the visible proof the stored flag changed.
    bookings.row('E2E Do zatwierdzenia').within(() => {
      cy.contains('button', 'Odwołaj').should('exist');
    });
  });

  it('resolves a slot as done with a participant count', () => {
    bookings.row('E2E Do zatwierdzenia').within(() => {
      cy.contains('button', 'Zatwierdź').click();
    });
    // The per-slot controls live in the expanded detail row, which is a second `<tr>` for the
    // same booking rather than a cell of the first. The detail row prints the tenant name
    // (`Wnioskodawca Testowy`), which is what identifies it here.
    bookings.showDetails().click();
    cy.contains('label.bs-checkbox', 'Pokaż szczegóły rezerwacji')
      .find('input[type=checkbox]')
      .should('be.checked');

    const details = () =>
      cy.contains('.bs-table__details', 'Wnioskodawca Testowy').closest('.bs-table__details');

    details().within(() => {
      cy.contains('button', 'Rozlicz').click();
    });

    cy.contains('.bs-bookings__resolve', 'Rozlicz slot').should('exist');
    cy.selectByLabel('Status', 'DONE');
    cy.typeByLabel('Uczestnicy', '12');
    bookings.saveResolve().click();

    // The slot is resolved: the controls are replaced by the "Slot rozliczony" marker, which is
    // the client mirror of the server's resolved-slot rule (FR-018).
    details().should('contain', 'Slot rozliczony');
  });

  it('archives a booking and it leaves the default list', () => {
    bookings.row('E2E Kalendarz').within(() => {
      cy.contains('button', 'Archiwizuj').click();
    });

    // The default staff list filters `archive: false`, so the archived row disappears — the
    // visible consequence of the archive route's write.
    cy.contains('.bs-table tbody tr', 'E2E Kalendarz').should('not.exist');
  });
});
