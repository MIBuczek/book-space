import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { AdminShellComponent } from './admin-shell.component';
import { adminUser, employeeUser } from '../../../testing/fixtures';

describe('AdminShellComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const render = () => {
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('renders only Calendar and Bookings for an employee', () => {
    TestBed.inject(SessionStore).set('token-1', employeeUser());

    const links = Array.from(
      (render().nativeElement as HTMLElement).querySelectorAll('.bs-admin__tabs a')
    ).map((a) => a.textContent?.trim());

    expect(links).toEqual(['Calendar', 'Bookings']);
  });

  it('renders all five tabs for an administrator', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());

    const links = Array.from(
      (render().nativeElement as HTMLElement).querySelectorAll('.bs-admin__tabs a')
    ).map((a) => a.textContent?.trim());

    expect(links).toEqual(['Calendar', 'Bookings', 'Clients', 'Facilities', 'Summary']);
  });

  it('renders no tabs when the session has no capabilities', () => {
    // The guard should prevent this, but the shell must not render the full menu if it is
    // ever reached without a capability set.
    const links = (render().nativeElement as HTMLElement).querySelectorAll('.bs-admin__tabs a');
    expect(links).toHaveLength(0);
  });

  it('clears the session and leaves the admin area when sign-out is pressed', () => {
    const session = TestBed.inject(SessionStore);
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    session.set('token-1', adminUser());
    const fixture = render();

    const signOut = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Sign out')) as HTMLButtonElement;
    signOut.click();

    httpMock.expectOne('/api/auth/sign-out').flush({ message: 'Signed out' });

    expect(session.isAuthenticated()).toBe(false);
    // The guard runs on navigation, so clearing the session without moving would strand the
    // administrator on the admin route (US2 scenario 6).
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
