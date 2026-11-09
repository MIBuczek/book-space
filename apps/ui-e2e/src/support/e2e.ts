// Cypress loads this support file before every spec.
//
// It imports the custom commands the journeys use (`signIn`, the label-scoped field
// helpers). The backend harness is *not* here: it runs in Node via `setupNodeEvents` in
// `cypress.config.ts`, because a spec runs in the browser and cannot start a database.

import './commands';
