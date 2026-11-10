// Custom commands shared by the end-to-end journeys (T047).
//
// The starter file shipped a `cy.login` that only logged to the console — an undefined helper
// the generated spec called anyway. It is replaced by `signIn`, which drives the real form,
// plus the field helpers the kit's controls need. The app is zoneless and every control is a
// real `<input>`/`<select>`/`<button>`, so the journeys interact with the DOM exactly as a
// person would.

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Cypress {
  interface Chainable {
    /** Re-seeds the backend: drops the bookings the previous spec wrote and inserts the fixtures. */
    resetBackend(): Chainable<void>;
    /** Signs in through the real form and waits for the admin area. */
    signIn(email: string, password: string): Chainable<void>;
    /** Selects an option by the label the `book-space-select` renders. */
    selectByLabel(label: string, value: string): Chainable<void>;
    /** Types into the input by the label the `book-space-input` renders. */
    typeByLabel(label: string, value: string): Chainable<void>;
    /** Ticks the checkbox by the label the `book-space-checkbox` renders. */
    checkByLabel(label: string): Chainable<void>;
    /** Sets a `book-space-date-picker` by its label to a civil `YYYY-MM-DD` value. */
    setDateByLabel(label: string, isoDate: string): Chainable<void>;
  }
}

/** The `<label>` whose label span reads exactly `label`. */
const fieldByLabel = (label: string) => cy.contains('.bs-field__label', label).parent();

Cypress.Commands.add('resetBackend', () => {
  cy.task('backend:reset');
});

Cypress.Commands.add('signIn', (email: string, password: string) => {
  cy.visit('/sign-in');
  cy.typeByLabel('E-mail', email);
  cy.typeByLabel('Hasło', password);
  cy.contains('button', 'Zaloguj się').click();
  cy.location('pathname').should('include', '/admin');
});

Cypress.Commands.add('selectByLabel', (label: string, value: string) => {
  fieldByLabel(label).find('select').select(value);
});

Cypress.Commands.add('typeByLabel', (label: string, value: string) => {
  fieldByLabel(label).find('input').clear().type(value);
});

Cypress.Commands.add('checkByLabel', (label: string) => {
  cy.contains('label.bs-checkbox', label).find('input[type=checkbox]').check();
});

Cypress.Commands.add('setDateByLabel', (label: string, isoDate: string) => {
  // A native date input cannot be typed into reliably; setting the value and firing `change`
  // is what the control's `(change)` handler listens for, so the signal updates as it would
  // for a person picking the day.
  fieldByLabel(label).find('input[type=date]').invoke('val', isoDate).trigger('change');
});

export {};
