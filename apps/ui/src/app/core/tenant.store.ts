import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ITenant } from '@models/tenant.model';
import { TenantApi } from './tenant.api';

/**
 * Holds the tenant identity for the shell (T252, FR-007).
 *
 * A signal store rather than an `rxResource` in each component: the footer, the contact page,
 * the cookie notice and the booking form all render a tenant value, and a per-component read
 * would issue the same request several times per page and let the screens disagree while one of
 * them is still loading.
 *
 * The read is triggered by the shell's initializer, not by this constructor, so a spec that
 * injects the store does not have to answer a request it did not ask for. Until the read
 * resolves `tenant()` is `null`, and a consumer hides the element it would otherwise fill —
 * the fail-closed shape the contract asks for (SC-005), so no screen shows a placeholder URL.
 */
@Injectable({ providedIn: 'root' })
export class TenantStore {
  private readonly api = inject(TenantApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly tenantSignal = signal<ITenant | null>(null);
  readonly tenant = this.tenantSignal.asReadonly();

  /**
   * Fetches the tenant identity once. Errors are swallowed: the tenant values are decoration on
   * every screen, so a failed read must not surface a server-error page or block a route — the
   * elements that would have used them simply stay hidden.
   */
  load(): void {
    this.api
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tenant) => this.set(tenant),
        error: () => undefined,
      });
  }

  /**
   * Publishes a tenant identity. Called by `load()`, and directly by a spec that needs a
   * component to render with a tenant — the same seam `SessionStore.set` gives the session.
   */
  set(tenant: ITenant): void {
    this.tenantSignal.set(tenant);
  }
}
