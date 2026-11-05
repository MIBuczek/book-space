import { ErrorHandler, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ErrorStore } from './error.store';

/**
 * The application-wide error boundary.
 *
 * Angular calls `handleError` for an exception it cannot attribute to a
 * component, so this is the one place a render-time failure is caught rather
 * than escaping to the console and leaving a blank page. It records the message
 * and navigates to the server-error page; it deliberately does not rethrow,
 * because the default handler's job is done once the user has been told.
 *
 * An `HttpErrorResponse` reaching here means the interceptor did not see it
 * (it was thrown in a component), so it is treated the same way — the user sees
 * one failure page rather than two code paths.
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  private readonly errors = inject(ErrorStore);
  private readonly router = inject(Router);

  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    this.errors.reportServerError(message);
    void this.router.navigate(['/server-error']);
  }
}
