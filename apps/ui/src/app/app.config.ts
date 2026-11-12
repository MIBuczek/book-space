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
    // Revalidates a persisted session before the first route resolves: `/auth/me` refreshes
    // the capabilities (a role or deny-list change reaches the navigation immediately) and
    // discards a token the server no longer accepts. `restore()` completes rather than
    // errors, so a rejected token leaves the app on the public route instead of aborting
    // bootstrap and blanking the page.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
