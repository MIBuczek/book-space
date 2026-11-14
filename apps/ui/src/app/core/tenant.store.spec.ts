import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TenantStore } from './tenant.store';

/**
 * The store is the shell's single source of the tenant identity (T252), so the tests assert the
 * two things that matter: the read fills the signal from `GET /api/tenant`, and a failed read is
 * swallowed rather than surfaced — a tenant value is decoration, so a failure must leave the
 * signal `null` (every consumer hides its element) and must not throw into the shell.
 */
describe('TenantStore', () => {
  let store: TenantStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(TenantStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with no tenant until the read resolves', () => {
    expect(store.tenant()).toBeNull();
  });

  it('fills the signal from GET /api/tenant', () => {
    store.load();
    const request = httpMock.expectOne('/api/tenant');
    expect(request.request.method).toBe('GET');
    request.flush({
      name: 'Example Sports',
      contactEmail: 'office@example.com',
      websiteUrl: 'https://example.com',
      privacyUrl: 'https://example.com/privacy',
    });

    expect(store.tenant()).toEqual({
      name: 'Example Sports',
      contactEmail: 'office@example.com',
      websiteUrl: 'https://example.com',
      privacyUrl: 'https://example.com/privacy',
    });
  });

  // A failure leaves the signal `null` so every consumer hides its element; the shell must not
  // see the error, because a tenant value is decoration and must not blank a page.
  it('leaves the signal null when the read fails', () => {
    store.load();
    httpMock.expectOne('/api/tenant').flush('nope', { status: 500, statusText: 'Server Error' });

    expect(store.tenant()).toBeNull();
  });

  it('publishes a tenant directly through set', () => {
    store.set({
      name: 'Set Directly',
      contactEmail: null,
      websiteUrl: null,
      privacyUrl: null,
    });
    expect(store.tenant()?.name).toBe('Set Directly');
  });
});
