import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from './session.store';

/**
 * Attaches the bearer token to every API request that has one.
 *
 * A functional interceptor, not a class, because it has no state of its own —
 * the token comes from `SessionStore`. An absolute URL is left alone so the
 * interceptor cannot leak the token to a third-party origin.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(SessionStore).token();

  if (token === null || !isApiRequest(request.url)) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

const isApiRequest = (url: string): boolean => url.startsWith('/api') || url.includes('/api/');
