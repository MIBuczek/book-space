import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { NavComponent } from './nav.component';
import { adminUser, employeeUser } from '../../testing/fixtures';

describe('NavComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [NavComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const render = () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('offers sign-in and hides the admin link for an anonymous visitor', () => {
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Sign in');
    expect(text).not.toContain('Admin');
  });

  it('offers the admin link and the user e-mail to an administrator', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Admin');
    expect(text).toContain('admin@sisk.pl');
    expect(text).toContain('Sign out');
  });

  it('offers the admin link to a signed-in employee', () => {
    // The admin area is staff, not administrator-only: an employee uses the Calendar and
    // Bookings tabs. Hiding the link from them would lock them out of their own workspace.
    TestBed.inject(SessionStore).set('token-1', employeeUser());
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Admin');
    expect(text).toContain('Sign out');
  });

  it('clears the session when sign-out is pressed', () => {
    const session = TestBed.inject(SessionStore);
    session.set('token-1', adminUser());
    const fixture = render();

    const signOut = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Sign out')) as HTMLButtonElement;
    signOut.click();

    httpMock.expectOne('/api/auth/sign-out').flush({ message: 'Signed out' });

    expect(session.isAuthenticated()).toBe(false);
  });
});
