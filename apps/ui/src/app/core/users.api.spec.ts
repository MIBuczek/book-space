import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {UsersApi} from './users.api';

/**
 * The `/users` client (FR-045).
 *
 * It is the UI's single entry point to the endpoint, so the assertions pin the URL, the method and
 * the body — a screen that hand-built a request could send a different shape, and the server would
 * answer `422` for a reason unrelated to what the operator typed.
 */
describe('UsersApi', () => {
  let api: UsersApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(UsersApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists users', () => {
    api.list().subscribe();
    const request = httpMock.expectOne('/api/users');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('posts a create body', () => {
    const body = {
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      password: 'secret1',
      recheckPassword: 'secret1',
      role: 'OFFICE' as const,
      city: 'siechnice',
    };
    api.create(body).subscribe();
    const request = httpMock.expectOne('/api/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({_id: 'u2'});
  });

  it('puts an update to the user route', () => {
    api.update('u2', {firstName: 'Anna'}).subscribe();
    const request = httpMock.expectOne('/api/users/u2');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({firstName: 'Anna'});
    request.flush({});
  });

  it('deactivates through an update rather than a delete (FR-047)', () => {
    api.deactivate('u2').subscribe();
    const request = httpMock.expectOne('/api/users/u2');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({active: false});
    request.flush({});
  });
});
