import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IUser } from '@models/user.model';
import { authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to an API request', () => {
    TestBed.inject(SessionStore).set('token-1', user);

    http.get('/api/bookings').subscribe();

    const request = httpMock.expectOne('/api/bookings');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush({});
  });

  it('leaves an API request unauthenticated when there is no token', () => {
    http.get('/api/bookings').subscribe();

    const request = httpMock.expectOne('/api/bookings');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('does not attach the token to a third-party origin', () => {
    TestBed.inject(SessionStore).set('token-1', user);

    http.get('https://example.com/collect').subscribe();

    const request = httpMock.expectOne('https://example.com/collect');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
