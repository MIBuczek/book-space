import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { IUserCapabilities } from '@models/user.model';
import { SessionStore } from './session.store';

/**
 * Lets a request reach a route only when the account holds the named capability.
 *
 * A factory rather than one guard per route: the capability set lives in the model and the
 * API resolves it, so a route only has to name the flag it needs. The check reads
 * `SessionStore.capabilities()`, which is the server's answer — not a role re-derived in
 * the client, which is what the legacy `credentials-function.ts` helpers did in five
 * different components.
 *
 * `CanMatchFn` rather than `CanActivateFn`: it runs before the route's chunk is fetched, so
 * a caller who cannot use a tab never downloads it. This is a usability guard; the endpoint
 * behind the tab enforces the same rule (FR-003), so a caller who bypasses this gains
 * nothing but a `403`.
 *
 * A caller without a session is sent to sign-in; a signed-in caller who lacks the
 * capability is sent to the public calendar rather than to sign-in, because they hold a
 * valid session and offering them the sign-in page would be wrong.
 */
export const capabilityGuard = (capability: keyof IUserCapabilities): CanMatchFn => {
  return () => {
    const session = inject(SessionStore);
    const router = inject(Router);

    if (!session.isAuthenticated()) {
      return router.createUrlTree(['/sign-in']);
    }

    return session.capabilities()?.[capability] === true
      ? true
      : router.createUrlTree(['/']);
  };
};
