import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { capabilityGuard } from './core/capability.guard';
import { guestGuard } from './core/guest.guard';

/**
 * The application's routes.
 *
 * Public routes load eagerly; the admin area is a lazy `loadChildren` behind `authGuard`
 * and `capabilityGuard('staff')`, so its chunk is never fetched by a caller who cannot use
 * it. The admin area is staff, not administrator-only: an office user has the Clients,
 * Facilities and Summary tabs, so the guard that admits it is the staff capability, and each
 * tab carries its own capability guard. `withComponentInputBinding()` in `app.config.ts` is
 * what lets a future `:id` param arrive as a signal input with no `ActivatedRoute` plumbing.
 *
 * `/sign-in` carries `guestGuard`: a signed-in caller who reaches it is sent to the admin
 * area rather than shown a form that would issue a second token.
 *
 * The `**` route is last: first-match ordering applies here too, and a wildcard declared
 * earlier would swallow every path.
 */
export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./features/public-calendar/public-calendar.component').then(
        (m) => m.PublicCalendarComponent
      ),
  },
  {
    path: 'sign-in',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./features/sign-in/sign-in.component').then((m) => m.SignInComponent),
  },
  {
    path: 'booking-request',
    loadComponent: () =>
      import('./features/booking-request/booking-request.component').then(
        (m) => m.BookingRequestComponent
      ),
  },
  {
    path: 'admin',
    canMatch: [authGuard, capabilityGuard('staff')],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/informational/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: 'server-error',
    loadComponent: () =>
      import('./features/informational/server-error.component').then(
        (m) => m.ServerErrorComponent
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/informational/not-found.component').then((m) => m.NotFoundComponent),
  },
];
