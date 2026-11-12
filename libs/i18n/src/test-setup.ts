// Zoneless test environment, matching the app (see `apps/ui/src/test-setup.ts`). The i18n
// library is consumed by a zoneless app, so its specs must not install a zone either.
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv();
