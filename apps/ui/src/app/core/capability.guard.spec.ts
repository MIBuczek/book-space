import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { SessionStore } from './session.store';
import { capabilityGuard } from './capability.guard';
import { adminUser, employeeUser } from '../../testing/fixtures';

describe('capabilityGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  const run = (capability: Parameters<typeof capabilityGuard>[0]) =>
    TestBed.runInInjectionContext(() => capabilityGuard(capability)({} as never, [] as never, {} as never));

  it('admits a caller who holds the capability', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());
    expect(run('canManageUsers')).toBe(true);
  });

  it('sends a signed-in caller who lacks the capability to the public calendar', () => {
    // An employee is signed in but has no administrator capability. Sign-in would be
    // wrong: they hold a valid session, so the calendar is the only sensible landing.
    TestBed.inject(SessionStore).set('token-1', employeeUser());

    const result = run('canManageUsers');

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/');
  });

  it('sends an anonymous caller to sign-in', () => {
    const result = run('staff');

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/sign-in');
  });

  it('fails closed when the capability set is absent', () => {
    // A session whose stored user predates the capabilities field — a stale localStorage
    // entry — must not be treated as "allowed". `?.` reads it as undefined and the guard
    // refuses, rather than flashing an admin route before `/auth/me` refreshes the user.
    TestBed.inject(SessionStore).set('token-1', adminUser());
    const session = TestBed.inject(SessionStore);
    session.setUser({...adminUser(), capabilities: undefined as never});

    expect(String(run('staff') as UrlTree)).toBe('/');
  });

  it('serialises the redirect through the real router', () => {
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(run('staff') as UrlTree)).toBe('/sign-in');
  });
});
