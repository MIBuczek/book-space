import { Injectable, signal } from '@angular/core';

/**
 * The most recent unrecoverable failure, or `null`.
 *
 * A server error is not a form-validation message: it is the app telling the
 * user "this page could not load". Keeping it in a store rather than on each
 * component means the error boundary can render it without every feature
 * repeating the same `@if (error())` block.
 */
@Injectable({ providedIn: 'root' })
export class ErrorStore {
  private readonly serverErrorSignal = signal<string | null>(null);

  readonly serverError = this.serverErrorSignal.asReadonly();

  reportServerError(message: string): void {
    this.serverErrorSignal.set(message);
  }

  clear(): void {
    this.serverErrorSignal.set(null);
  }
}
