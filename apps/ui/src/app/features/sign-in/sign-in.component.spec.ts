import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { SignInComponent } from './sign-in.component';
import { adminUser } from '../../../testing/fixtures';
import { provideTestI18n } from '../../../testing/i18n-testing';

const user = adminUser();

describe('SignInComponent', () => {
  let httpMock: HttpTestingController;
  let navigate: jest.SpyInstance;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestI18n(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const render = () => {
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
    return fixture;
  };

  const fill = (
    fixture: ReturnType<typeof TestBed.createComponent<SignInComponent>>,
    email = 'admin@example.com',
    password = 'secret'
  ) => {
    const inputs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input')
    ) as HTMLInputElement[];
    inputs[0].value = email;
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = password;
    inputs[1].dispatchEvent(new Event('input'));
  };

  const submit = (fixture: ReturnType<typeof TestBed.createComponent<SignInComponent>>) =>
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

  it('submits the credentials and navigates to the admin area on success', () => {
    const fixture = render();
    fill(fixture);
    submit(fixture);

    const request = httpMock.expectOne('/api/auth/sign-in');
    expect(request.request.body).toEqual({ email: 'admin@example.com', password: 'secret' });
    request.flush({ user, token: 'token-1' });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/admin']);
    expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(true);
  });

  it('shows the single sign-in failure message on 401', () => {
    const fixture = render();
    fill(fixture);
    submit(fixture);
    httpMock.expectOne('/api/auth/sign-in').flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Nieprawidłowy e-mail lub hasło');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a generic message for a non-401 failure', () => {
    const fixture = render();
    fill(fixture);
    submit(fixture);
    httpMock
      .expectOne('/api/auth/sign-in')
      .flush({}, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Logowanie nie powiodło się');
  });

  it('rejects an address without @ before making a request', () => {
    const fixture = render();
    fill(fixture, 'not-an-address', 'secret');
    submit(fixture);
    fixture.detectChanges();

    httpMock.expectNone('/api/auth/sign-in');
    const errors = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(errors).toContain('E-mail musi zawierać @');
  });

  it('rejects a too-short password before making a request', () => {
    const fixture = render();
    fill(fixture, 'admin@example.com', 'abcde');
    submit(fixture);
    fixture.detectChanges();

    httpMock.expectNone('/api/auth/sign-in');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Hasło musi mieć od 6 do 30 znaków'
    );
  });

  it('rejects an empty e-mail and an empty password', () => {
    const fixture = render();
    submit(fixture);
    fixture.detectChanges();

    httpMock.expectNone('/api/auth/sign-in');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('E-mail jest wymagany');
    expect(text).toContain('Hasło jest wymagane');
  });

  it('rejects an over-long password', () => {
    const fixture = render();
    fill(fixture, 'admin@example.com', 'a'.repeat(31));
    submit(fixture);
    fixture.detectChanges();

    httpMock.expectNone('/api/auth/sign-in');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Hasło musi mieć od 6 do 30 znaków'
    );
  });

  it('rejects an over-long e-mail', () => {
    const fixture = render();
    fill(fixture, `${'a'.repeat(125)}@x.pl`, 'secret');
    submit(fixture);
    fixture.detectChanges();

    httpMock.expectNone('/api/auth/sign-in');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'E-mail musi mieć od 3 do 125 znaków'
    );
  });

  it('does not show field errors before the first submit', () => {
    const fixture = render();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('wymagan');
  });

  it('clears a previous failure message when a new attempt is submitted', () => {
    const fixture = render();
    fill(fixture, 'admin@example.com', 'secret');
    submit(fixture);
    httpMock.expectOne('/api/auth/sign-in').flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nieprawidłowy');

    submit(fixture);
    fixture.detectChanges();

    // The new attempt is in flight, so the stale message is gone and the form is disabled.
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Nieprawidłowy');
    httpMock.expectOne('/api/auth/sign-in').flush({ user, token: 'token-2' });
  });
});
