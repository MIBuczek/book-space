// Page objects for the end-to-end journeys (T047).
//
// The starter exported a single `getGreeting` that read the `h1` the scaffold rendered. The
// real pages have named regions and the kit's controls, so the objects here name those rather
// than leaving raw selectors in the specs. Each object is a small set of functions over the
// page it represents, so a spec reads as a journey and a DOM change is one edit here.

/** The top navigation, present on every page. */
export const nav = {
  link: (label: string) => cy.contains('.bs-nav__links a', label),
  signInLink: () => cy.get('.bs-nav__session').contains('a', 'Zaloguj'),
  signOutButton: () => cy.get('.bs-nav__session').contains('button', 'Wyloguj'),
  userEmail: () => cy.get('.bs-nav__user'),
  /** Whether the Admin link is offered; the API's capability decides it. */
  adminLink: () => cy.get('.bs-nav__links').contains('a', 'Administracja'),
};

/** The public calendar (`/`). */
export const calendar = {
  heading: () => cy.get('h1'),
  viewButton: (label: string) => cy.get('.bs-calendar__views').contains('button', label),
  next: () => cy.contains('.bs-calendar__period button', 'Następny'),
  events: () => cy.get('.bs-event'),
  event: (title: string) => cy.contains('.bs-event', title),
  publicNotice: () => cy.get('.bs-calendar__notice'),
  details: () => cy.get('.bs-calendar__details'),
};

/** The public booking request form (`/booking-request`). */
export const bookingRequest = {
  heading: () => cy.get('h1'),
  addSlot: () => cy.contains('button', 'Dodaj termin'),
  submit: () => cy.contains('button', 'Wyślij prośbę o rezerwację'),
  success: () => cy.get('.bs-request__success'),
  error: () => cy.get('.bs-request__error'),
};

/** The sign-in page (`/sign-in`). */
export const signIn = {
  heading: () => cy.get('h1'),
  error: () => cy.get('.bs-sign-in__error'),
  submit: () => cy.contains('button', 'Zaloguj się'),
};

/** The admin frame and its tabs. */
export const admin = {
  tabs: () => cy.get('.bs-admin__tabs a'),
  tab: (label: string) => cy.get('.bs-admin__tabs').contains('a', label),
  signOut: () => cy.contains('.bs-admin__tabs button', 'Wyloguj'),
};

/** The bookings table tab. */
export const bookings = {
  heading: () => cy.contains('h1', 'Lista rezerwacji'),
  rows: () => cy.get('.bs-table tbody tr'),
  row: (nick: string) => cy.contains('.bs-table tbody tr', nick),
  conflictsCounter: () => cy.get('.bs-bookings__conflicts'),
  warning: () => cy.get('.bs-bookings__warning'),
  showDetails: () => cy.contains('label.bs-checkbox', 'Pokaż szczegóły rezerwacji'),
  approveButton: () => cy.contains('button', 'Zatwierdź'),
  archiveButton: () => cy.contains('button', 'Archiwizuj'),
  resolveButton: () => cy.contains('button', 'Rozlicz'),
  saveResolve: () => cy.contains('dialog[open] button', 'Zapisz'),
};

/** The printable summary tab. */
export const summary = {
  heading: () => cy.contains('h1', 'Podsumowanie'),
};
