import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IUser } from '@models/user.model';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

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
    let emitted: IUser | undefined;
    service.signIn({email: 'admin@sisk.pl', password: 'secret'}).subscribe((u) => (emitted = u));

    const request = httpMock.expectOne('/api/auth/sign-in');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({email: 'admin@sisk.pl', password: 'secret'});
    request.flush({user, token: 'token-1'});

    expect(emitted).toEqual(user);
    expect(session.token()).toBe('token-1');
    expect(session.user()).toEqual(user);
  });

  it('leaves the session empty when sign-in fails', () => {
    const session = TestBed.inject(SessionStore);
    service.signIn({email: 'admin@sisk.pl', password: 'wrong'}).subscribe({error: () => undefined});

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
});
