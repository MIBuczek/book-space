import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { IUser } from '@models/user.model';
import { adminGuard } from './admin.guard';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'office@sisk.pl',
  firstName: 'Olga',
  lastName: 'Office',
  role: 'OFFICE',
  active: true,
};

describe('adminGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  const run = () => TestBed.runInInjectionContext(() => adminGuard({} as never, [] as never, {} as never));

  it('allows an administrator through', () => {
    TestBed.inject(SessionStore).set('token-1', {...user, role: 'ADMIN'});
    expect(run()).toBe(true);
  });

  it('sends a signed-in non-administrator to the public calendar', () => {
    TestBed.inject(SessionStore).set('token-1', user);
    const result = run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/');
  });

  it('sends an anonymous caller to sign-in', () => {
    const result = run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/sign-in');
  });

  it('serialises the redirect through the real router', () => {
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(run() as UrlTree)).toBe('/sign-in');
  });
});
