import { Route } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';

/**
 * The application's routes.
 *
 * Public routes load eagerly; the admin area is a lazy `loadChildren` behind
 * `authGuard` and `adminGuard`, so its chunk is never fetched by a caller who
 * cannot use it. `withComponentInputBinding()` in `app.config.ts` is what lets a
 * future `:id` param arrive as a signal input with no `ActivatedRoute`
 * plumbing.
 *
 * The `**` route is last: first-match ordering applies here too, and a wildcard
 * declared earlier would swallow every path.
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
    loadComponent: () =>
      import('./features/sign-in/sign-in.component').then((m) => m.SignInComponent),
  },
  {
    path: 'admin',
    canMatch: [authGuard, adminGuard],
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
