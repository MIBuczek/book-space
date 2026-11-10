import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IClient} from '@models/client.model';
import {IPaginated} from '@models/pagination.model';
import {SessionStore} from '../../../core/session.store';
import {adminUser, officeUser} from '../../../../testing/fixtures';
import {ClientsTableComponent} from './clients-table.component';

const client = (overrides: Partial<IClient> = {}): IClient => ({
  _id: 'c1',
  type: 'COMPANY',
  name: 'Firma sp. z o.o.',
  contactPerson: 'Jan Nowak',
  phone: '609996064',
  email: 'biuro@example.com',
  street: 'ul. Kwiatowa 1',
  city: 'siechnice',
  zipCode: '55-010',
  nip: '8991234567',
  active: true,
  ...overrides,
});

const page = (items: IClient[], total = items.length): IPaginated<IClient> => ({
  items,
  total,
  page: 1,
  limit: 20,
});

describe('ClientsTableComponent', () => {
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ClientsTableComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const listRequest = () =>
    httpMock.expectOne((request) => request.url === '/api/clients' && request.method === 'GET');

  const render = async (clients: IClient[] = [client()], user = adminUser()) => {
    session.set('token', user);
    const fixture = TestBed.createComponent(ClientsTableComponent);
    fixture.detectChanges();
    listRequest().flush(page(clients));
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

  const setCheckbox = (
    fixture: Fixture,
    label: string,
    checked: boolean,
    root?: ParentNode
  ): void => {
    const input = control(fixture, label, root) as HTMLInputElement;
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const pressButton = (fixture: Fixture, label: string, root: ParentNode = element(fixture)): void => {
    const host = Array.from(root.querySelectorAll<HTMLElement>('book-space-button')).find(
      (candidate) => candidate.textContent?.trim() === label
    );
    if (!host) {
      throw new Error(`No button labelled "${label}"`);
    }
    host.querySelector('button')?.click();
    fixture.detectChanges();
  };

  /** The one dialog a press has opened; the two modals are always mounted, only one open. */
  const openPanel = (fixture: Fixture): ParentNode => {
    const dialog = element(fixture).querySelector('dialog[open]');
    if (!dialog) {
      throw new Error('No open dialog');
    }
    return dialog;
  };

  /** Fills the form with a complete company so a save is not blocked by client validation. */
  const fillValidCompany = (fixture: Fixture): void => {
    setSelect(fixture, 'Typ', 'COMPANY');
    const panel = openPanel(fixture);
    setText(fixture, 'Nazwa firmy', 'Firma sp. z o.o.', panel);
    setText(fixture, 'Osoba kontaktowa', 'Jan Nowak', panel);
    setText(fixture, 'Telefon', '609996064', panel);
    setText(fixture, 'E-mail', 'biuro@example.com', panel);
    setText(fixture, 'Ulica', 'ul. Kwiatowa 1', panel);
    setText(fixture, 'Miasto', 'siechnice', panel);
    setText(fixture, 'Kod pocztowy', '55-010', panel);
    setText(fixture, 'NIP', '8991234567', panel);
  };

  const flushReload = async (clients: IClient[] = []): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    listRequest().flush(page(clients));
    await Promise.resolve();
  };

  it('lists the clients and sends the page and limit', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(ClientsTableComponent);
    fixture.detectChanges();

    const request = listRequest();
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.has('search')).toBe(false);
    request.flush(page([client()]));
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Firma sp. z o.o.');
  });

  it('sends the search term and resets to the first page', async () => {
    const fixture = await render();
    fixture.componentInstance.onPage(3);
    fixture.detectChanges();
    await Promise.resolve();
    listRequest().flush(page([]));
    await Promise.resolve();
    fixture.detectChanges();

    setText(fixture, 'Wyszukaj klienta', 'Kowalski');
    await Promise.resolve();
    const request = listRequest();
    expect(request.request.params.get('search')).toBe('Kowalski');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([]));
  });

  it('changes the page size and returns to the first page', async () => {
    const fixture = await render();
    fixture.componentInstance.onPage(2);
    fixture.detectChanges();
    await Promise.resolve();
    const second = listRequest();
    expect(second.request.params.get('page')).toBe('2');
    second.flush(page([]));
    await Promise.resolve();
    fixture.detectChanges();

    fixture.componentInstance.onLimit('50');
    fixture.detectChanges();
    await Promise.resolve();
    const resized = listRequest();
    expect(resized.request.params.get('limit')).toBe('50');
    expect(resized.request.params.get('page')).toBe('1');
    resized.flush(page([]));
  });

  it('shows the total from the envelope', async () => {
    const fixture = await render([client()]);
    expect(fixture.componentInstance.total()).toBe(1);
  });

  it('reports an empty list and zero total before the read resolves', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(ClientsTableComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(fixture.componentInstance.total()).toBe(0);
    listRequest().flush(page([]));
  });

  it('offers no write controls without a session', async () => {
    const fixture = TestBed.createComponent(ClientsTableComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.canWrite()).toBe(false);
    expect(element(fixture).textContent).not.toContain('Dodaj klienta');
    listRequest().flush(page([]));
  });

  it('offers the write controls to an administrator', async () => {
    const fixture = await render([client()], adminUser());

    expect(element(fixture).textContent).toContain('Dodaj klienta');
    expect(element(fixture).textContent).toContain('Edytuj');
    expect(element(fixture).textContent).toContain('Usuń');
  });

  it('hides the write controls from an office user', async () => {
    const fixture = await render([client()], officeUser());

    expect(element(fixture).textContent).toContain('Firma sp. z o.o.');
    expect(element(fixture).textContent).not.toContain('Dodaj klienta');
    expect(element(fixture).textContent).not.toContain('Edytuj');
    expect(element(fixture).textContent).not.toContain('Usuń');
  });

  it('creates a client and reloads the list', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj klienta');
    fillValidCompany(fixture);
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      type: 'COMPANY',
      name: 'Firma sp. z o.o.',
      nip: '8991234567',
    });
    request.flush(client());

    await flushReload([client()]);
    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('reveals and requires the NIP field only for a company', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj klienta');
    // Defaults to an individual: no NIP field.
    expect(openPanel(fixture).textContent).not.toContain('NIP');

    setSelect(fixture, 'Typ', 'COMPANY');
    expect(openPanel(fixture).textContent).toContain('NIP');

    // Submitting without a NIP is refused client-side: no request is sent.
    setText(fixture, 'Nazwa firmy', 'Firma sp. z o.o.', openPanel(fixture));
    setText(fixture, 'Osoba kontaktowa', 'Jan Nowak', openPanel(fixture));
    setText(fixture, 'Telefon', '609996064', openPanel(fixture));
    setText(fixture, 'E-mail', 'biuro@example.com', openPanel(fixture));
    setText(fixture, 'Ulica', 'ul. Kwiatowa 1', openPanel(fixture));
    setText(fixture, 'Miasto', 'siechnice', openPanel(fixture));
    setText(fixture, 'Kod pocztowy', '55-010', openPanel(fixture));
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    httpMock.expectNone('/api/clients');
    expect(openPanel(fixture).textContent).toContain('NIP jest wymagany dla firmy');
  });

  it('switches the name label with the type', async () => {
    const fixture = await render([]);

    pressButton(fixture, 'Dodaj klienta');
    expect(openPanel(fixture).textContent).toContain('Imię i nazwisko');

    setSelect(fixture, 'Typ', 'COMPANY');
    expect(openPanel(fixture).textContent).toContain('Nazwa firmy');
  });

  it('edits a client through the update route', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    expect(fixture.componentInstance.form().name).toBe('Firma sp. z o.o.');

    setText(fixture, 'Nazwa firmy', 'Nowa nazwa', openPanel(fixture));
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({name: 'Nowa nazwa', nip: '8991234567'});
    request.flush(client({name: 'Nowa nazwa'}));

    await flushReload([client({name: 'Nowa nazwa'})]);
  });

  it('deactivates a client through the active checkbox (T059)', async () => {
    // The supported retirement path: a delete is refused while a booking references the
    // client, so the form's active flag is how the operator retires one instead.
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    setCheckbox(fixture, 'Klient aktywny', false, openPanel(fixture));
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({active: false});
    request.flush(client({active: false}));

    await flushReload([client({active: false})]);
  });

  it('cancels an edit without sending a request', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.editing()).toBe(false);
    httpMock.expectNone('/api/clients/c1');
  });

  it('surfaces a server validation error against the field it names', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(
      {statusCode: 422, message: ['city must be longer than or equal to 3 characters'], error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.fieldErrors().city).toMatch(/city/);
    expect(openPanel(fixture).textContent).toContain('city must be longer');
  });

  it('shows a message that names no field as a general error', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(
      {statusCode: 422, message: ['property nonsense should not exist'], error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.generalError()).toBe('property nonsense should not exist');
    expect(openPanel(fixture).textContent).toContain('property nonsense should not exist');
  });

  it('shows a general message for a non-validation failure', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    request.flush('boom', {status: 500, statusText: 'Server Error'});
    fixture.detectChanges();

    expect(fixture.componentInstance.generalError()).toContain('Nie udało się zapisać');
  });

  it('falls back to a general message for a 422 whose body carries no message list', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(
      {statusCode: 422, message: 'not a list', error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.generalError()).toBe('Popraw dane i spróbuj ponownie.');
    expect(openPanel(fixture).textContent).toContain('Popraw dane i spróbuj ponownie.');
  });

  it('falls back to a general message for a 422 with an empty body', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(null, {status: 422, statusText: 'Unprocessable Entity'});
    fixture.detectChanges();

    expect(fixture.componentInstance.generalError()).toBe('Popraw dane i spróbuj ponownie.');
  });

  it('does nothing when a delete is confirmed with no target', async () => {
    const fixture = await render([client()]);

    fixture.componentInstance.confirmDelete();

    expect(fixture.componentInstance.deleteTarget()).toBeNull();
    httpMock.expectNone('/api/clients/c1');
  });

  it('deletes a client only after confirmation', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Usuń');
    expect(element(fixture).textContent).toContain('Czy na pewno chcesz usunąć klienta');

    pressButton(fixture, 'Usuń', openPanel(fixture));
    const request = httpMock.expectOne('/api/clients/c1');
    expect(request.request.method).toBe('DELETE');
    request.flush({});

    await flushReload([]);
  });

  it('cancels a delete without sending a request', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Usuń');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.deleteTarget()).toBeNull();
    httpMock.expectNone('/api/clients/c1');
  });

  it('shows the server message when a delete is refused with 409 (T059)', async () => {
    // A client a booking still references is refused; the modal must say so rather than
    // silently doing nothing, which would look like a broken button.
    const fixture = await render([client()]);

    pressButton(fixture, 'Usuń');
    pressButton(fixture, 'Usuń', openPanel(fixture));
    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(
      {statusCode: 409, message: 'This client is referenced by a booking and cannot be deleted.'},
      {status: 409, statusText: 'Conflict'}
    );
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('referenced by a booking');
    // The modal stays open so the operator can read the message and cancel.
    expect(fixture.componentInstance.deleteTarget()).not.toBeNull();
  });

  it('falls back to a generic message when a delete fails for another reason', async () => {
    const fixture = await render([client()]);

    pressButton(fixture, 'Usuń');
    pressButton(fixture, 'Usuń', openPanel(fixture));
    const request = httpMock.expectOne('/api/clients/c1');
    request.flush(null, {status: 500, statusText: 'Server Error'});
    fixture.detectChanges();

    expect(fixture.componentInstance.deleteError()).toBe(
      'Nie udało się usunąć klienta. Spróbuj ponownie później.'
    );
  });
});
