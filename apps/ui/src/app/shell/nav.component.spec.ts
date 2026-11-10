import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { NavComponent } from './nav.component';
import { adminUser, employeeUser } from '../../testing/fixtures';

@Component({ selector: 'book-space-route-stub', template: '' })
class RouteStubComponent {}

describe('NavComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [NavComponent],
      providers: [
        provideRouter([
          { path: '', component: RouteStubComponent },
          { path: 'booking-request', component: RouteStubComponent },
          { path: 'contact', component: RouteStubComponent },
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
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('offers sign-in and hides the admin link for an anonymous visitor', () => {
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Zaloguj');
    expect(text).not.toContain('Administracja');
  });

  it('links the public booking request form', () => {
    const fixture = render();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/booking-request"]'
    );
    expect(link?.textContent).toContain('Rezerwacja');
  });

  it('offers the admin link and the user e-mail to an administrator', () => {
    TestBed.inject(SessionStore).set('token-1', adminUser());
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Administracja');
    expect(text).toContain('admin@sisk.pl');
    expect(text).toContain('Wyloguj');
  });

  it('offers the admin link to a signed-in employee', () => {
    // The admin area is staff, not administrator-only: an employee uses the Calendar and
    // Bookings tabs. Hiding the link from them would lock them out of their own workspace.
    TestBed.inject(SessionStore).set('token-1', employeeUser());
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Administracja');
    expect(text).toContain('Wyloguj');
  });

  it('marks the current page with aria-current, not only colour (NFR-006)', async () => {
    const router = TestBed.inject(Router);
    const fixture = render();

    await router.navigateByUrl('/booking-request');
    await fixture.whenStable();
    fixture.detectChanges();

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page');
    // The `active` class is a colour change; `aria-current` is what a screen reader reads.
    expect(current).toHaveLength(1);
    expect(current[0].textContent?.trim()).toBe('Rezerwacja');
  });

  it('clears the session when sign-out is pressed', () => {
    const session = TestBed.inject(SessionStore);
    session.set('token-1', adminUser());
    const fixture = render();

    const signOut = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Wyloguj')) as HTMLButtonElement;
    signOut.click();

    httpMock.expectOne('/api/auth/sign-out').flush({ message: 'Signed out' });

    expect(session.isAuthenticated()).toBe(false);
  });
});
