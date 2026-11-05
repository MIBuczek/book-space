import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { IUser } from '@models/user.model';
import { SessionStore } from '../../core/session.store';
import { SignInComponent } from './sign-in.component';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

describe('SignInComponent', () => {
  let httpMock: HttpTestingController;
  let navigate: jest.SpyInstance;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const fill = (fixture: ReturnType<typeof TestBed.createComponent<SignInComponent>>) => {
    const inputs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input')
    ) as HTMLInputElement[];
    inputs[0].value = 'admin@sisk.pl';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = 'secret';
    inputs[1].dispatchEvent(new Event('input'));
  };

  it('submits the credentials and navigates to the admin area on success', () => {
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
    fill(fixture);

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

    const request = httpMock.expectOne('/api/auth/sign-in');
    expect(request.request.body).toEqual({email: 'admin@sisk.pl', password: 'secret'});
    request.flush({user, token: 'token-1'});
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/admin']);
    expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(true);
  });

  it('shows the single sign-in failure message on 401', () => {
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
    fill(fixture);

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    httpMock
      .expectOne('/api/auth/sign-in')
      .flush({}, {status: 401, statusText: 'Unauthorized'});
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Invalid e-mail or password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a generic message for a non-401 failure', () => {
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
    fill(fixture);

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    httpMock
      .expectOne('/api/auth/sign-in')
      .flush({}, {status: 500, statusText: 'Internal Server Error'});
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Sign-in failed');
  });
});
