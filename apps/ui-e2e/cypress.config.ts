import {nxE2EPreset} from '@nx/cypress/plugins/cypress-preset';
import {defineConfig} from 'cypress';
import type {E2EBackend} from './src/support/backend';
import {startBackend} from './src/support/backend';

/**
 * The end-to-end configuration for the P1 journeys (T047).
 *
 * The Angular dev server proxies `/api` to the Nest application on port 3000 (see
 * `apps/ui/proxy.conf.json`), so the browser talks to one origin and the app's relative
 * `/api` calls reach the real backend. The backend itself — an ephemeral `mongod` and the
 * built Nest bundle — is started here in `setupNodeEvents`, which runs in Node before the
 * specs, and stopped when the run finishes.
 *
 * Seeding is exposed as Cypress tasks rather than done from the specs: a spec runs in the
 * browser and cannot open a database connection. Each spec resets the seed in `beforeEach`,
 * so the journeys cannot leak into each other.
 */
let backend: E2EBackend | undefined;
const backendReady: Promise<E2EBackend> = startBackend().then((started) => {
  backend = started;
  return started;
});

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__dirname),
    baseUrl: 'http://localhost:4200',
    setupNodeEvents(on, config) {
      on('task', {
        /** Re-inserts the seed bookings, dropping whatever the previous spec left behind. */
        'backend:reset': async () => {
          await (await backendReady).reset();
          return null;
        },
        /** Inserts one booking shaped like the stored document and returns its id. */
        'backend:insertBooking': async (booking: Parameters<E2EBackend['insertBooking']>[0]) => {
          return (await backendReady).insertBooking(booking);
        },
        /** The stored booking with this `nick`, or `null`. Proves a public submission landed. */
        'backend:findBookingByNick': async (nick: string) => {
          const found = await (await backendReady).findBookingByNick(nick);
          // Cypress tasks serialise their result through JSON, and a `null` result is the
          // documented way to return "nothing found"; an `undefined` is a task error.
          return found === null ? null : JSON.parse(JSON.stringify(found));
        },
      });

      on('after:run', async () => {
        await backend?.stop();
      });

      return config;
    },
  },
});
