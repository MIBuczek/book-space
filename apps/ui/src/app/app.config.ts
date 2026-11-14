import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withEnabledBlockingInitialNavigation,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { provideAppI18n } from '@booking/i18n';
import { appRoutes } from './app.routes';
import { AuthService } from './core/auth.service';
import { TenantStore } from './core/tenant.store';
import { authInterceptor } from './core/auth.interceptor';
import { errorInterceptor } from './core/error.interceptor';
import { GlobalErrorHandler } from './core/global-error.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withEnabledBlockingInitialNavigation()
    ),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Runtime translations (FR-013): one build serves every language, and the stored choice is
    // applied before the first route resolves so the first paint is translated rather than a
    // flash of keys.
    provideAppI18n(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // The tenant identity (FR-007) is decoration on every screen, so it is fetched without
    // blocking the first route: `load()` swallows a failure and the elements that would use the
    // values stay hidden until it resolves. Awaiting it here would hold up the whole app on a
    // request that is not needed to render a page.
    provideAppInitializer(() => {
      inject(TenantStore).load();
    }),
    // Revalidates a persisted session before the first route resolves: `/auth/me` refreshes
    // the capabilities (a role change reaches the navigation immediately) and
    // discards a token the server no longer accepts. `restore()` completes rather than
    // errors, so a rejected token leaves the app on the public route instead of aborting
    // bootstrap and blanking the page.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
