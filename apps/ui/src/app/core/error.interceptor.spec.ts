import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError } from 'rxjs';
import { IUser } from '@models/user.model';
import { errorInterceptor } from './error.interceptor';
import { ErrorStore } from './error.store';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

// Passes every request through except `/boom`, where it throws a plain Error.
// The interceptor must leave a non-HTTP failure untouched, and there is no way
// to produce one through HttpTestingController alone.
const plainErrorInterceptor: HttpInterceptorFn = (request, next) =>
  request.url === '/boom' ? throwError(() => new Error('boom')) : next(request);

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor, plainErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('clears the session and redirects to sign-in on 401', () => {
    const session = TestBed.inject(SessionStore);
    session.set('token-1', user);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/bookings').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/bookings').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(session.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/sign-in']);
  });

  it('records the message and redirects to the server-error page on 5xx', () => {
    const errors = TestBed.inject(ErrorStore);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/bookings').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/bookings')
      .flush({}, { status: 500, statusText: 'Internal Server Error' });

    expect(errors.serverError()).toContain('Internal Server Error');
    expect(navigate).toHaveBeenCalledWith(['/server-error']);
  });

  it('leaves a non-HTTP failure untouched', () => {
    const errors = TestBed.inject(ErrorStore);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    let received: unknown = null;

    http.get('/boom').subscribe({ error: (error: unknown) => (received = error) });

    expect((received as Error).message).toBe('boom');
    expect(errors.serverError()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('re-throws the error so the caller still sees the failure', () => {
    let received: unknown = null;
    http.get('/api/bookings').subscribe({ error: (error: unknown) => (received = error) });
    httpMock.expectOne('/api/bookings').flush({}, { status: 404, statusText: 'Not Found' });

    expect(received).not.toBeNull();
  });

  it('leaves a client error other than 401 to the caller', () => {
    const errors = TestBed.inject(ErrorStore);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/bookings').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/bookings').flush({}, { status: 403, statusText: 'Forbidden' });

    expect(errors.serverError()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
