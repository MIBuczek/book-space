// ***********************************************
// Custom commands shared by the P1 journey specs.
//
// The kit wraps every control in a `<label>`, so a field is reached by its visible label
// text rather than by an id the caller would have to know. `field` returns the wrapping
// `.bs-field` (an input, a select or a date picker); `checkBox` returns the `.bs-checkbox`
// wrapper. Keeping the lookups here means a kit class rename is one edit, not one per spec.
// ***********************************************

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Cypress {
  interface Chainable {
    /**
     * The `.bs-field` wrapper for the control labelled `label`.
     *
     * Chain `.find('input')` or `.find('select')` to reach the control itself.
     */
    field(label: string): Chainable<JQuery<HTMLElement>>;
    /** The `.bs-checkbox` wrapper labelled `label`. */
    checkBox(label: string): Chainable<JQuery<HTMLElement>>;
  }
}

Cypress.Commands.add('field', (label: string) => cy.contains('.bs-field__label', label).parent());

Cypress.Commands.add('checkBox', (label: string) => cy.contains('.bs-checkbox', label));
