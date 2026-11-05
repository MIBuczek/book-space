import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

/**
 * Keeps a signed-in caller away from the sign-in page.
 *
 * The counterpart of `authGuard`: an authenticated user who opens `/sign-in` — by an old
 * bookmark, or by pressing Back after signing in — is sent to the admin area rather than
 * being shown a form that would issue a second token. The legacy `Login.tsx` redirected on
 * `auth` for the same reason.
 *
 * It is a `CanMatchFn` so the sign-in chunk is not fetched for a caller who cannot use it.
 */
export const guestGuard: CanMatchFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return session.isAuthenticated() ? router.createUrlTree(['/admin']) : true;
};
