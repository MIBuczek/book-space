import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

/**
 * Lets a request reach an administrator-only route.
 *
 * A caller who is signed in but is not an administrator is sent to the public
 * calendar rather than to sign-in: they hold a valid session, so offering them
 * the sign-in page would be wrong. `authGuard` runs first, so `isAuthenticated`
 * is already known here.
 */
export const adminGuard: CanMatchFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (session.role() === 'ADMIN') {
    return true;
  }

  return router.createUrlTree([session.isAuthenticated() ? '/' : '/sign-in']);
};
