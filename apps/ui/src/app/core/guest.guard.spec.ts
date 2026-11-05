import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { SessionStore } from './session.store';
import { guestGuard } from './guest.guard';
import { adminUser } from '../../testing/fixtures';

describe('guestGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  const run = () => TestBed.runInInjectionContext(() => guestGuard({} as never, [] as never, {} as never));

  it('admits an anonymous caller to the sign-in page', () => {
    expect(run()).toBe(true);
  });

  it('sends a signed-in caller to the admin area', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());

    const result = run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/admin');
  });

  it('serialises the redirect through the real router', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(run() as UrlTree)).toBe('/admin');
  });
});
