import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TenantApi } from './tenant.api';

/**
 * The API wrapper is the UI's single entry point to the public tenant read (T252). The test pins
 * the URL, because a typo there is a `404` the store swallows into an absent tenant — a silently
 * unbranded shell rather than an error.
 */
describe('TenantApi', () => {
  let api: TenantApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(TenantApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads GET /api/tenant', () => {
    const tenant = {
      name: 'Example Sports',
      contactEmail: null,
      websiteUrl: null,
      privacyUrl: null,
    };
    let received: unknown;
    api.get().subscribe((value) => (received = value));

    const request = httpMock.expectOne('/api/tenant');
    expect(request.request.method).toBe('GET');
    request.flush(tenant);

    expect(received).toEqual(tenant);
  });
});
