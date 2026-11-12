import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';
import { adminUser } from '../../testing/fixtures';

const user = adminUser();

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stores the token and user on a successful sign-in', () => {
    const session = TestBed.inject(SessionStore);
    let emitted: unknown;
    service.signIn({email: 'admin@example.com', password: 'secret'}).subscribe((u) => (emitted = u));

    const request = httpMock.expectOne('/api/auth/sign-in');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({email: 'admin@example.com', password: 'secret'});
    request.flush({user, token: 'token-1'});

    expect(emitted).toEqual(user);
    expect(session.token()).toBe('token-1');
    expect(session.user()).toEqual(user);
  });

  it('leaves the session empty when sign-in fails', () => {
    const session = TestBed.inject(SessionStore);
    service.signIn({email: 'admin@example.com', password: 'wrong'}).subscribe({error: () => undefined});

    httpMock
      .expectOne('/api/auth/sign-in')
      .flush({message: 'Invalid e-mail or password'}, {status: 401, statusText: 'Unauthorized'});

    expect(session.isAuthenticated()).toBe(false);
  });

  it('clears the session after sign-out completes', () => {
    const session = TestBed.inject(SessionStore);
    session.set('token-1', user);

    service.signOut().subscribe();
    httpMock.expectOne('/api/auth/sign-out').flush({message: 'Signed out'});

    expect(session.isAuthenticated()).toBe(false);
  });

  it('clears the session even when the sign-out request fails', () => {
    const session = TestBed.inject(SessionStore);
    session.set('token-1', user);

    service.signOut().subscribe({error: () => undefined});
    httpMock
      .expectOne('/api/auth/sign-out')
      .flush({}, {status: 500, statusText: 'Internal Server Error'});

    expect(session.isAuthenticated()).toBe(false);
  });

  describe('me', () => {
    it('fetches the current user from /auth/me', () => {
      let emitted: unknown;
      service.me().subscribe((u) => (emitted = u));

      httpMock.expectOne('/api/auth/me').flush(user);

      expect(emitted).toEqual(user);
    });
  });

  describe('restore', () => {
    it('does nothing when there is no session', () => {
      let emitted: unknown = 'not-called';
      service.restore().subscribe((u) => (emitted = u));

      // No request is made without a token, so an anonymous visitor does not trigger a 401.
      httpMock.expectNone('/api/auth/me');
      expect(emitted).toBeNull();
    });

    it('refreshes the stored user from /auth/me, keeping the token', () => {
      const session = TestBed.inject(SessionStore);
      session.set('token-1', user);
      const promoted = {...user, role: 'ADMIN' as const};

      service.restore().subscribe();
      httpMock.expectOne('/api/auth/me').flush(promoted);

      expect(session.user()).toEqual(promoted);
      // The token must survive: `/auth/me` does not return one, and a restore that cleared
      // it would sign the caller out by refreshing them.
      expect(session.token()).toBe('token-1');
    });

    it('clears the session and completes when the token is rejected', () => {
      const session = TestBed.inject(SessionStore);
      session.set('token-1', user);
      let completed = false;

      service.restore().subscribe({complete: () => (completed = true)});
      httpMock.expectOne('/api/auth/me').flush({}, {status: 401, statusText: 'Unauthorized'});

      // It must complete rather than error: an initializer that threw would abort bootstrap
      // and blank the page.
      expect(completed).toBe(true);
      expect(session.isAuthenticated()).toBe(false);
    });

    it('clears the session on a transport failure too', () => {
      const session = TestBed.inject(SessionStore);
      session.set('token-1', user);

      service.restore().subscribe();
      httpMock
        .expectOne('/api/auth/me')
        .flush({}, {status: 503, statusText: 'Service Unavailable'});

      expect(session.isAuthenticated()).toBe(false);
    });
  });
});
