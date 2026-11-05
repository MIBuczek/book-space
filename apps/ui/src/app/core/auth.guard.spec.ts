import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { IUser } from '@models/user.model';
import { authGuard } from './auth.guard';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

describe('authGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  const run = () => TestBed.runInInjectionContext(() => authGuard({} as never, [] as never, {} as never));

  it('allows a signed-in caller through', () => {
    TestBed.inject(SessionStore).set('token-1', user);
    expect(run()).toBe(true);
  });

  it('redirects an anonymous caller to sign-in', () => {
    const result = run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/sign-in');
  });

  it('redirects to sign-in even when the router is the real one', () => {
    const router = TestBed.inject(Router);
    const result = run();
    expect(router.serializeUrl(result as UrlTree)).toBe('/sign-in');
  });
});
