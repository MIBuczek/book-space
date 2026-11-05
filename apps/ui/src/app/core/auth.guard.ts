import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionStore } from '../core/session.store';

/**
 * Lets a request reach the admin area only when a session exists.
 *
 * `CanMatchFn` rather than `CanActivateFn`: it runs before the route's chunk is
 * fetched, so an anonymous visitor never downloads the admin bundle. The
 * redirect target is returned as a `UrlTree` so the router navigates without a
 * second navigation being triggered by a side effect.
 */
export const authGuard: CanMatchFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return session.isAuthenticated() ? true : router.createUrlTree(['/sign-in']);
};
