import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IUser} from '@models/user.model';
import {IBuilding} from '@models/building.model';
import {SessionStore} from '../../../core/session.store';
import {adminUser} from '../../../../testing/fixtures';
import {UsersTableComponent} from './users-table.component';
import {provideTestI18n} from '../../../../testing/i18n-testing';

const user = (overrides: Partial<IUser> = {}): IUser => ({
  _id: 'u1',
  email: 'anna@example.com',
  firstName: 'Anna',
  lastName: 'Nowak',
  role: 'OFFICE',
  city: 'siechnice',
  active: true,
  ...overrides,
});

const facility = (overrides: Partial<IBuilding> = {}): IBuilding => ({
  _id: 'b1',
  name: 'Hala Sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1'],
  lighting: true,
  toilets: true,
  email: 'hala@example.com',
  phone: '710000001',
  employees: [],
  ...overrides,
});

describe('UsersTableComponent', () => {
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [UsersTableComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const listRequest = () =>
    httpMock.expectOne((request) => request.url === '/api/users' && request.method === 'GET');

  const facilitiesRequest = () =>
    httpMock.expectOne((request) => request.url === '/api/buildings' && request.method === 'GET');

  const render = async (users: IUser[] = [user()]) => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(UsersTableComponent);
    fixture.detectChanges();
    listRequest().flush(users);
    // The facilities read is independent; flush it so no request is left outstanding.
    facilitiesRequest().flush([facility()]);
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  };

  type Fixture = Awaited<ReturnType<typeof render>>;
  const element = (fixture: Fixture): HTMLElement => fixture.nativeElement as HTMLElement;

  const control = (fixture: Fixture, label: string, root: ParentNode = element(fixture)) => {
    const wrapper = Array.from(root.querySelectorAll<HTMLElement>('label')).find((candidate) =>
      candidate.textContent?.includes(label)
    );
    if (!wrapper) {
      throw new Error(`No field labelled "${label}"`);
    }
    return wrapper.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
  };

  const setText = (fixture: Fixture, label: string, value: string, root?: ParentNode): void => {
    const input = control(fixture, label, root) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const setSelect = (fixture: Fixture, label: string, value: string): void => {
    const select = control(fixture, label) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const setCheckbox = (fixture: Fixture, label: string, checked: boolean): void => {
    const input = control(fixture, label) as HTMLInputElement;
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const pressButton = (
    fixture: Fixture,
    label: string,
    root: ParentNode = element(fixture)
  ): void => {
    const host = Array.from(root.querySelectorAll<HTMLElement>('book-space-button')).find(
      (candidate) => candidate.textContent?.trim() === label
    );
    if (!host) {
      throw new Error(`No button labelled "${label}"`);
    }
    host.querySelector('button')?.click();
    fixture.detectChanges();
  };

  const openPanel = (fixture: Fixture): ParentNode => {
    const dialog = element(fixture).querySelector('dialog[open]');
    if (!dialog) {
      throw new Error('No open dialog');
    }
    return dialog;
  };

  /** Fills the form with a complete office user so a save is not blocked by validation. */
  const fillValidOfficeUser = (fixture: Fixture): void => {
    const panel = openPanel(fixture);
    setText(fixture, 'Imię', 'Anna', panel);
    setText(fixture, 'Nazwisko', 'Nowak', panel);
    setText(fixture, 'E-mail', 'anna@example.com', panel);
    setText(fixture, 'Hasło', 'secret1', panel);
    setText(fixture, 'Powtórz hasło', 'secret1', panel);
    setSelect(fixture, 'Rola', 'OFFICE');
    setSelect(fixture, 'Miasto', 'siechnice');
  };

  const flushReload = async (users: IUser[] = []): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    listRequest().flush(users);
    await Promise.resolve();
  };

  it('lists the users', async () => {
    const fixture = await render([user()]);
    expect(element(fixture).textContent).toContain('Anna Nowak');
    expect(element(fixture).textContent).toContain('Biuro');
  });

  it('reports an empty list before the read resolves', () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(UsersTableComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.rows()).toEqual([]);
    listRequest().flush([]);
    facilitiesRequest().flush([]);
  });

  it('renders the error state when the read fails', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(UsersTableComponent);
    fixture.detectChanges();
    listRequest().flush('boom', {status: 500, statusText: 'Server Error'});
    facilitiesRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Nie udało się wczytać użytkowników');
  });

  it('creates a user with the role and city and reloads the list', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj użytkownika');
    fillValidOfficeUser(fixture);
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      role: 'OFFICE',
      city: 'siechnice',
    });
    request.flush(user());

    await flushReload([user()]);
    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('requires a password to create', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj użytkownika');
    const panel = openPanel(fixture);
    setText(fixture, 'Imię', 'Anna', panel);
    setText(fixture, 'Nazwisko', 'Nowak', panel);
    setText(fixture, 'E-mail', 'anna@example.com', panel);
    setSelect(fixture, 'Rola', 'OFFICE');
    setSelect(fixture, 'Miasto', 'siechnice');
    pressButton(fixture, 'Zapisz', panel);

    httpMock.expectNone('/api/users');
    expect(openPanel(fixture).textContent).toContain('Hasło musi mieć');
  });

  it('requires a city for a non-administrator and hides the field for an administrator', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj użytkownika');
    const panel = openPanel(fixture);
    expect(openPanel(fixture).textContent).toContain('Miasto');

    setSelect(fixture, 'Rola', 'ADMIN');
    expect(openPanel(fixture).textContent).not.toContain('Miasto');

    // An administrator saves without a city.
    setText(fixture, 'Imię', 'Ada', panel);
    setText(fixture, 'Nazwisko', 'Admin', panel);
    setText(fixture, 'E-mail', 'ada@example.com', panel);
    setText(fixture, 'Hasło', 'secret1', panel);
    setText(fixture, 'Powtórz hasło', 'secret1', panel);
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users');
    expect(request.request.body).not.toHaveProperty('city');
    request.flush(user({role: 'ADMIN'}));

    await flushReload([]);
  });

  it('assigns a facility through the checkboxes', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj użytkownika');
    fillValidOfficeUser(fixture);
    setCheckbox(fixture, 'Hala Sportowa', true);
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users');
    expect(request.request.body).toMatchObject({buildings: ['hala-sportowa']});
    request.flush(user());

    await flushReload([]);
  });

  it('edits a user without requiring a password, because blank means unchanged', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    expect(fixture.componentInstance.form().firstName).toBe('Anna');

    setText(fixture, 'Imię', 'Aniela', openPanel(fixture));
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users/u1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({firstName: 'Aniela'});
    expect(request.request.body).not.toHaveProperty('password');
    request.flush(user({firstName: 'Aniela'}));

    await flushReload([user({firstName: 'Aniela'})]);
  });

  it('cancels an edit without sending a request', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.editing()).toBe(false);
    httpMock.expectNone('/api/users/u1');
  });

  it('deactivates an account through an update, not a delete (FR-047)', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Dezaktywuj');
    pressButton(fixture, 'Dezaktywuj', openPanel(fixture));

    const request = httpMock.expectOne('/api/users/u1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({active: false});
    request.flush({});

    await flushReload([]);
  });

  it('offers no deactivate action for an already inactive account', async () => {
    const fixture = await render([user({active: false})]);
    expect(element(fixture).textContent).toContain('Nieaktywne');
    expect(element(fixture).textContent).not.toContain('Dezaktywuj');
  });

  it('shows the server message when the last administrator refuses deactivation', async () => {
    const fixture = await render([user({role: 'ADMIN'})]);

    pressButton(fixture, 'Dezaktywuj');
    pressButton(fixture, 'Dezaktywuj', openPanel(fixture));

    const request = httpMock.expectOne('/api/users/u1');
    request.flush(
      {statusCode: 409, message: 'The last active administrator cannot be removed', error: 'Conflict'},
      {status: 409, statusText: 'Conflict'}
    );
    fixture.detectChanges();

    // The UI shows its own Polish message for the 409; the server's English is not rendered
    // (NFR-005, T061).
    expect(openPanel(fixture).textContent).toContain('Nie można dezaktywować tego konta.');
  });

  it('surfaces a server validation error against the field it names', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users/u1');
    request.flush(
      {statusCode: 422, message: ['E-mail address need to contains correct pattern.'], error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();

    // The field is located from the server's message; the text is the UI's own Polish.
    expect(fixture.componentInstance.fieldErrors().email).toBe('Nieprawidłowa wartość.');
    expect(openPanel(fixture).textContent).toContain('Nieprawidłowa wartość.');
  });

  it('shows an unmatched 422 message as a general error', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush(
        {statusCode: 422, message: ['Role must be one of ADMIN, OFFICE, EMPLOYEE.'], error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
    fixture.detectChanges();

    // The message names no field, so it becomes the generic prompt; the server's English is
    // never rendered (NFR-005, T061).
    expect(openPanel(fixture).textContent).toContain('Popraw dane i spróbuj ponownie.');
  });

  it('falls back to a general message when a 422 carries no field list', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush(
        {statusCode: 422, message: 'Something went wrong', error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
    fixture.detectChanges();

    expect(openPanel(fixture).textContent).toContain('Popraw dane i spróbuj ponownie');
  });

  it('shows a generic message when a save fails for an unrelated reason', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush('boom', {status: 500, statusText: 'Server Error'});
    fixture.detectChanges();

    expect(openPanel(fixture).textContent).toContain('Nie udało się zapisać użytkownika');
  });

  it('falls back to a generic deactivation message when the failure carries none', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Dezaktywuj');
    pressButton(fixture, 'Dezaktywuj', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush(null, {status: 409, statusText: 'Conflict'});
    fixture.detectChanges();

    expect(openPanel(fixture).textContent).toContain('Nie można dezaktywować tego konta');
  });

  it('removes an assigned facility when its checkbox is cleared', async () => {
    const fixture = await render([user({buildings: ['hala-sportowa']})]);

    pressButton(fixture, 'Edytuj');
    expect(fixture.componentInstance.isAssigned('hala-sportowa')).toBe(true);

    setCheckbox(fixture, 'Hala Sportowa', false);
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/users/u1');
    expect(request.request.body).not.toHaveProperty('buildings');
    request.flush(user());

    await flushReload([]);
  });

  it('hides the assignment editor when the facility list cannot be loaded', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(UsersTableComponent);
    fixture.detectChanges();
    listRequest().flush([]);
    facilitiesRequest().flush('boom', {status: 500, statusText: 'Server Error'});
    await Promise.resolve();
    fixture.detectChanges();

    pressButton(fixture, 'Dodaj użytkownika');
    expect(openPanel(fixture).textContent).not.toContain('Przypisane obiekty');
  });

  it('does nothing when a deactivation is confirmed with no target', async () => {
    const fixture = await render([user()]);
    fixture.componentInstance.confirmDeactivate();
    httpMock.expectNone('/api/users/u1');
  });

  it('falls back to a general message when a 422 body is empty', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush(null, {status: 422, statusText: 'Unprocessable Entity'});
    fixture.detectChanges();

    expect(openPanel(fixture).textContent).toContain('Popraw dane i spróbuj ponownie');
  });

  it('shows a generic deactivation message for a failure that is not a conflict', async () => {
    const fixture = await render([user()]);

    pressButton(fixture, 'Dezaktywuj');
    pressButton(fixture, 'Dezaktywuj', openPanel(fixture));

    httpMock
      .expectOne('/api/users/u1')
      .flush('boom', {status: 500, statusText: 'Server Error'});
    fixture.detectChanges();

    expect(openPanel(fixture).textContent).toContain('Nie udało się dezaktywować konta');
  });
});
