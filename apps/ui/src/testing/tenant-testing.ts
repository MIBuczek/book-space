import { signal } from '@angular/core';
import { ITenant } from '@models/tenant.model';
import { TenantStore } from '../app/core/tenant.store';

/**
 * A tenant identity for a component spec (T252).
 *
 * The shell components read `TenantStore` for the brand and the contact details, so a spec that
 * renders one needs a value. The real store fetches over HTTP, which is not what those specs are
 * about — `tenant.store.spec.ts` and `tenant.api.spec.ts` drive that path — so this helper
 * provides a store whose `tenant()` returns the given value.
 *
 * A spec that wants to prove the *absent* behaviour passes `null` (or omits the helper's value)
 * and asserts the element is hidden.
 */
export const testTenant = (overrides: Partial<ITenant> = {}): ITenant => ({
  name: 'Example Sports',
  contactEmail: 'office@example.com',
  websiteUrl: 'https://example.com',
  privacyUrl: 'https://example.com/privacy',
  ...overrides,
});

/** Providers that make `TenantStore` answer `tenant` without a request. */
export const provideTestTenant = (tenant: ITenant | null = testTenant()) => {
  const value = signal<ITenant | null>(tenant);
  return [
    {
      provide: TenantStore,
      useValue: {
        tenant: value.asReadonly(),
        load: () => undefined,
        set: (next: ITenant) => value.set(next),
      },
    },
  ];
};
