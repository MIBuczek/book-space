import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { SessionStore } from './session.store';
import { adminUser } from '../../testing/fixtures';

const user = adminUser();

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
