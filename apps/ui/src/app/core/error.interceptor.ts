import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ErrorStore } from './error.store';
import { SessionStore } from './session.store';

/**
 * Turns the two unrecoverable HTTP outcomes into navigation.
 *
 * A `401` means the token is gone or expired, so the session is cleared and the
 * user is sent to sign-in; leaving it in place would make every later request
 * fail the same way. A `5xx` is not actionable by the user, so it is recorded
 * and the server-error page is shown instead of a half-rendered screen.
 *
 * The error is always re-thrown: an interceptor that swallows it turns a failure
 * into a success with `null`, which is how a broken screen silently renders
 * empty rather than telling the user anything.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const errors = inject(ErrorStore);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          session.clear();
          void router.navigate(['/sign-in']);
        } else if (error.status >= 500) {
          errors.reportServerError(error.message);
          void router.navigate(['/server-error']);
        }
      }
      return throwError(() => error);
    })
  );
};
