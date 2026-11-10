import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { AdminShellComponent } from './admin-shell.component';
import { adminUser, employeeUser } from '../../../testing/fixtures';

@Component({ selector: 'book-space-tab-stub', template: '' })
class TabStubComponent {}

describe('AdminShellComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [
        provideRouter([
          {
            path: 'admin',
            component: AdminShellComponent,
            children: [{ path: 'bookings', component: TabStubComponent }],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
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

  it('renders all six tabs for an administrator', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());

    const links = Array.from(
      (render().nativeElement as HTMLElement).querySelectorAll('.bs-admin__tabs a')
    ).map((a) => a.textContent?.trim());

    expect(links).toEqual(['Calendar', 'Bookings', 'Clients', 'Facilities', 'Summary', 'Users']);
  });

  it('marks the active tab with aria-current, not only colour and weight (NFR-006)', async () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());
    const router = TestBed.inject(Router);
    const fixture = render();

    await router.navigateByUrl('/admin/bookings');
    await fixture.whenStable();
    fixture.detectChanges();

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.bs-admin__tabs a')
    );
    const active = links.filter((a) => a.getAttribute('aria-current') === 'page');
    // Exactly one tab is current, and it is the routed one: the `active` class alone is a
    // colour change, which is the "state conveyed by colour only" defect NFR-006 names.
    expect(active).toHaveLength(1);
    expect(active[0].textContent?.trim()).toBe('Bookings');
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
