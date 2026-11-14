import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {throwError} from 'rxjs';
import {IBuilding} from '@models/building.model';
import {SessionStore} from '../../../core/session.store';
import {adminUser, employeeUser, makeCapabilities, makeUser, officeUser} from '../../../../testing/fixtures';
import {FacilitiesTabComponent} from './facilities-tab.component';
import {provideTestI18n} from '../../../../testing/i18n-testing';

const facility = (overrides: Partial<IBuilding> = {}): IBuilding => ({
  _id: 'b1',
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1', '1/2'],
  lighting: true,
  toilets: false,
  email: 'siechnice.hala@gmail.com',
  phone: '609 996 064',
  employees: ['Bożena Kaczyńska', 'Beata Hasiuk'],
  ...overrides,
});

const fitness = facility({
  _id: 'b2',
  name: 'Sala fitness',
  property: 'sala-fitness',
  email: 'fitness@example.com',
  employees: ['Dorota Gąszczak'],
});

const radwanice = facility({
  _id: 'b3',
  name: 'Hala w Radwanicach',
  property: 'hala-sportowa',
  city: 'radwanice',
  email: 'radwanice@example.com',
  employees: ['Inny Pracownik'],
});

describe('FacilitiesTabComponent', () => {
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FacilitiesTabComponent],
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
    httpMock.expectOne((request) => request.url === '/api/buildings' && request.method === 'GET');

  const render = async (facilities: IBuilding[] = [facility(), fitness], user = adminUser()) => {
    session.set('token', user);
    const fixture = TestBed.createComponent(FacilitiesTabComponent);
    fixture.detectChanges();
    listRequest().flush(facilities);
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
    return wrapper.querySelector('input, select, textarea') as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
  };

  const setSelect = (fixture: Fixture, label: string, value: string, root?: ParentNode): void => {
    const select = control(fixture, label, root) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const setText = (fixture: Fixture, label: string, value: string, root?: ParentNode): void => {
    const input = control(fixture, label, root) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const setCheckbox = (fixture: Fixture, label: string, checked: boolean, root?: ParentNode): void => {
    const input = control(fixture, label, root) as HTMLInputElement;
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

  const messagePanel = (fixture: Fixture): ParentNode =>
    element(fixture).querySelector('.bs-facilities__message') as ParentNode;

  const formPanel = (fixture: Fixture): ParentNode =>
    element(fixture).querySelector('.bs-facilities__form') as ParentNode;

  const deletePanel = (fixture: Fixture): ParentNode =>
    element(fixture).querySelector('.bs-facilities__delete') as ParentNode;

  const detailsPanel = (fixture: Fixture): ParentNode =>
    element(fixture).querySelector('.bs-facilities__details') as ParentNode;

  it('reads the staff facility list and shows the city and its first facility', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(FacilitiesTabComponent);
    fixture.detectChanges();

    const request = listRequest();
    expect(request.request.method).toBe('GET');
    request.flush([facility(), fitness]);
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Hala sportowa');
    expect(element(fixture).textContent).toContain('siechnice.hala@gmail.com');
    expect(element(fixture).textContent).toContain('1/1, 1/2');
    expect(fixture.componentInstance.selectedFacility()?.property).toBe('hala-sportowa');
  });

  it('shows a loading status before the read resolves', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(FacilitiesTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.facilities()).toEqual([]);
    expect(element(fixture).textContent).toContain('Wczytywanie obiektów');
    listRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('shows an error status when the read fails', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(FacilitiesTabComponent);
    fixture.detectChanges();

    listRequest().flush('boom', {status: 500, statusText: 'Server Error'});
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Nie udało się wczytać obiektów');
  });

  it('reports a city with no facilities instead of falling back to static data', async () => {
    const fixture = await render([facility()]);

    setSelect(fixture, 'Miejscowość', 'radwanice');

    expect(fixture.componentInstance.selectedFacility()).toBeNull();
    expect(element(fixture).textContent).toContain('Nie ma obiektów w tej miejscowości');
  });

  it('switches the facility within a city and re-fills the message form', async () => {
    const fixture = await render();

    setSelect(fixture, 'Obiekt', 'sala-fitness');

    expect(fixture.componentInstance.selectedFacility()?.property).toBe('sala-fitness');
    expect(fixture.componentInstance.form().recipient).toBe('fitness@example.com');
    expect(fixture.componentInstance.form().person).toBe('Dorota Gąszczak');
  });

  it('offers the same facility key in another city without confusion', async () => {
    const fixture = await render([facility(), radwanice]);

    setSelect(fixture, 'Miejscowość', 'radwanice');

    expect(fixture.componentInstance.selectedFacility()?.email).toBe('radwanice@example.com');
  });

  it('lists the facility employees', async () => {
    const fixture = await render();

    const table = element(fixture).querySelector('.bs-facilities__employees') as HTMLElement;
    expect(table.textContent).toContain('Bożena Kaczyńska');
    expect(table.textContent).toContain('Beata Hasiuk');
  });

  it('reports an employee list that is empty', async () => {
    const fixture = await render([facility({employees: []})]);

    expect(element(fixture).textContent).toContain('Ten obiekt nie ma przypisanych pracowników');
  });

  it('selects the employee whose message action was pressed', async () => {
    const fixture = await render();

    pressButton(fixture, 'Wiadomość', element(fixture).querySelector('.bs-facilities__employees') as ParentNode);

    expect(fixture.componentInstance.form().person).toBe('Bożena Kaczyńska');
  });

  it('sends a message to the employee and reports success', async () => {
    const fixture = await render();

    setText(fixture, 'E-mail', 'beata@example.com');
    setText(fixture, 'Wiadomość', 'Dzień dobry');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    const request = httpMock.expectOne('/api/notifications/message');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      person: 'Bożena Kaczyńska',
      email: 'siechnice.hala@gmail.com',
      message: 'Dzień dobry',
      recipient: 'beata@example.com',
    });
    request.flush({status: 'sent'});
    fixture.detectChanges();

    expect(fixture.componentInstance.sendSuccess()).toBe('Wiadomość została wysłana pomyślnie');
    expect(fixture.componentInstance.sending()).toBe(false);
    expect(element(fixture).textContent).toContain('Wiadomość została wysłana pomyślnie');
  });

  it('refuses to send an empty message and shows the field error', async () => {
    const fixture = await render();

    setText(fixture, 'Wiadomość', '   ');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    httpMock.expectNone('/api/notifications/message');
    expect(fixture.componentInstance.fieldErrors().message).toBe('Wiadomość nie może być pusta');
  });

  it('refuses to send to a malformed address', async () => {
    const fixture = await render();

    setText(fixture, 'E-mail', 'not-an-email');
    setText(fixture, 'Wiadomość', 'Dzień dobry');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    httpMock.expectNone('/api/notifications/message');
    expect(fixture.componentInstance.fieldErrors().recipient).toBe('Podaj poprawny adres e-mail');
  });

  it('shows a Polish prompt for a 422, not the server English field message (T061)', async () => {
    const fixture = await render();

    setText(fixture, 'Wiadomość', 'Dzień dobry');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    httpMock.expectOne('/api/notifications/message').flush(
      {statusCode: 422, message: ['recipient must be an email'], error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.sendError()).toBe('Popraw dane i spróbuj ponownie.');
    expect(element(fixture).textContent).toContain('Popraw dane i spróbuj ponownie.');
  });

  it('shows a generic prompt for a 422 with no message list', async () => {
    const fixture = await render();

    setText(fixture, 'Wiadomość', 'Dzień dobry');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    httpMock.expectOne('/api/notifications/message').flush(null, {
      status: 422,
      statusText: 'Unprocessable Entity',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.sendError()).toBe('Popraw dane i spróbuj ponownie.');
  });

  it('shows a visible error when the provider fails (FR-036, acceptance criterion 3)', async () => {
    const fixture = await render();

    setText(fixture, 'Wiadomość', 'Dzień dobry');
    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    httpMock.expectOne('/api/notifications/message').flush('boom', {
      status: 502,
      statusText: 'Bad Gateway',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.sendError()).toContain('Nie udało się wysłać wiadomości');
    expect(element(fixture).textContent).toContain('Nie udało się wysłać wiadomości');
  });

  it('shows a retry message for a non-HTTP failure', async () => {
    const fixture = await render();

    setText(fixture, 'Wiadomość', 'Dzień dobry');
    // A non-HTTP failure (a network error surfaced as a plain `Error`) is not an
    // `HttpErrorResponse`; the send is still surfaced rather than swallowed. The real
    // `HttpTestingController` always wraps a failure in an `HttpErrorResponse`, so the only way
    // to reach this branch is to fail the call directly.
    jest
      .spyOn(fixture.componentInstance['notificationsApi'], 'sendMessage')
      .mockReturnValue(throwError(() => new Error('offline')));

    pressButton(fixture, 'Wyślij', messagePanel(fixture));

    expect(fixture.componentInstance.sendError()).toContain('Nie udało się wysłać wiadomości');
  });

  it('hides the message action from a caller without the capability', async () => {
    const fixture = await render(
      [facility()],
      makeUser('EMPLOYEE', {capabilities: makeCapabilities({canSendFacilityMessages: false})})
    );

    expect(fixture.componentInstance.canSend()).toBe(false);
    expect(element(fixture).textContent).not.toContain('Wyślij wiadomość pracownikowi');
    expect(element(fixture).textContent).not.toContain('Wiadomość');
  });

  it('offers the message action to an employee, matching the capability matrix', async () => {
    const fixture = await render([facility()], employeeUser());

    expect(fixture.componentInstance.canSend()).toBe(true);
    expect(element(fixture).textContent).toContain('Wyślij wiadomość pracownikowi');
  });

  it('fails closed on the message action without a session', async () => {
    const fixture = TestBed.createComponent(FacilitiesTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.canSend()).toBe(false);
    expect(element(fixture).textContent).not.toContain('Wyślij wiadomość pracownikowi');
    listRequest().flush([facility()]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  describe('facility writes (T272)', () => {
    it('offers the create control to an administrator and hides it from office/employee', async () => {
      const admin = await render([facility()], adminUser());
      expect(admin.componentInstance.canWrite()).toBe(true);
      expect(element(admin).textContent).toContain('Dodaj obiekt');

      const office = await render([facility()], officeUser());
      expect(office.componentInstance.canWrite()).toBe(false);
      expect(element(office).textContent).not.toContain('Dodaj obiekt');
    });

    it('creates a facility from the form, then reloads the list', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Dodaj obiekt');
      expect(fixture.componentInstance.editing()).toBe(true);

      setText(fixture, 'Nazwa obiektu', 'Nowa hala', formPanel(fixture));
      setText(fixture, 'Klucz obiektu', 'nowa-hala', formPanel(fixture));
      setText(fixture, 'Miejscowość', 'olawa', formPanel(fixture));
      setText(fixture, 'E-mail', 'nowa@example.com', formPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '600 000 000', formPanel(fixture));
      setCheckbox(fixture, '1/1', true, formPanel(fixture));
      setText(fixture, 'Pracownicy (każdy w nowej linii)', 'Anna\nPiotr', formPanel(fixture));

      pressButton(fixture, 'Zapisz', formPanel(fixture));

      const request = httpMock.expectOne('/api/buildings');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        name: 'Nowa hala',
        property: 'nowa-hala',
        city: 'olawa',
        email: 'nowa@example.com',
        phone: '600 000 000',
        sizes: ['1/1'],
        lighting: false,
        toilets: false,
        employees: ['Anna', 'Piotr'],
        active: true,
      });
      request.flush(facility({_id: 'b9', name: 'Nowa hala', city: 'olawa'}));
      fixture.detectChanges();

      // The list reloads after a successful write.
      listRequest().flush([facility(), facility({_id: 'b9', name: 'Nowa hala', city: 'olawa'})]);
      await Promise.resolve();
      fixture.detectChanges();

      expect(fixture.componentInstance.editing()).toBe(false);
    });

    it('refuses to submit an incomplete form and never calls the API', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Dodaj obiekt');
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectNone('/api/buildings');
      expect(fixture.componentInstance.facilityErrors().name).toBeDefined();
      expect(fixture.componentInstance.facilityErrors().sizes).toBe(
        'Wybierz co najmniej jedną powierzchnię'
      );
    });

    it('edits the selected facility, sending only the changed value', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      expect(fixture.componentInstance.editTarget()?.property).toBe('hala-sportowa');

      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      const request = httpMock.expectOne('/api/buildings/b1');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body.phone).toBe('111 222 333');
      request.flush(facility());
      fixture.detectChanges();
      listRequest().flush([facility()]);
      await Promise.resolve();
      fixture.detectChanges();
    });

    it('maps a 422 back to the field it names (FR-026)', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(
        {statusCode: 422, message: ['Property need to be filled.'], error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityErrors().property).toBe('Nieprawidłowa wartość.');
      expect(element(fixture).textContent).toContain('Nieprawidłowa wartość.');
    });

    it('shows a generic save failure for a non-422 error', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush('boom', {status: 500, statusText: 'Server Error'});
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityGeneralError()).toContain('Nie udało się zapisać');
    });

    it('shows the general prompt for a 422 whose message names no field', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(
        {statusCode: 422, message: ['Number of characters need to be between 3 and 125'], error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityGeneralError()).toBe('Popraw dane i spróbuj ponownie.');
    });

    it('shows the general prompt for a 422 with no message list at all', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(null, {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityGeneralError()).toBe('Popraw dane i spróbuj ponownie.');
    });

    it('shows the general prompt for a 422 whose message is not a list', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(
        {statusCode: 422, message: 'Property need to be filled.', error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityGeneralError()).toBe('Popraw dane i spróbuj ponownie.');
    });

    it('shows the general prompt for a 422 whose body carries no message', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      pressButton(fixture, 'Zapisz', formPanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(
        {statusCode: 422, error: 'Unprocessable Entity'},
        {status: 422, statusText: 'Unprocessable Entity'}
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.facilityGeneralError()).toBe('Popraw dane i spróbuj ponownie.');
    });

    it('shows a generic save failure for a non-HTTP error', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      setText(fixture, 'Telefon kontaktowy', '111 222 333', formPanel(fixture));
      jest
        .spyOn(fixture.componentInstance['facilitiesApi'], 'update')
        .mockReturnValue(throwError(() => new Error('offline')));

      pressButton(fixture, 'Zapisz', formPanel(fixture));

      expect(fixture.componentInstance.facilityGeneralError()).toContain('Nie udało się zapisać');
    });

    it('cancels an edit without sending a request', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Dodaj obiekt');
      pressButton(fixture, 'Anuluj', formPanel(fixture));

      httpMock.expectNone('/api/buildings');
      expect(fixture.componentInstance.editing()).toBe(false);
    });

    it('deletes the selected facility after confirmation, then reloads', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Usuń', detailsPanel(fixture));
      expect(fixture.componentInstance.deleteTarget()?.property).toBe('hala-sportowa');

      pressButton(fixture, 'Usuń', deletePanel(fixture));

      const request = httpMock.expectOne('/api/buildings/b1');
      expect(request.request.method).toBe('DELETE');
      request.flush({});
      fixture.detectChanges();

      listRequest().flush([]);
      await Promise.resolve();
      fixture.detectChanges();
      expect(fixture.componentInstance.deleteTarget()).toBeNull();
    });

    it('names the conflict when a delete is refused with 409 (T059)', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Usuń', detailsPanel(fixture));
      pressButton(fixture, 'Usuń', deletePanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush(
        {statusCode: 409, message: ['Facility is referenced'], error: 'Conflict'},
        {status: 409, statusText: 'Conflict'}
      );
      fixture.detectChanges();

      expect(fixture.componentInstance.deleteError()).toContain('Nie można usunąć obiektu');
      expect(element(fixture).textContent).toContain('Nie można usunąć obiektu');
    });

    it('shows a generic delete failure for a non-409 error', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Usuń', detailsPanel(fixture));
      pressButton(fixture, 'Usuń', deletePanel(fixture));

      httpMock.expectOne('/api/buildings/b1').flush('boom', {status: 500, statusText: 'Server Error'});
      fixture.detectChanges();

      expect(fixture.componentInstance.deleteError()).toContain('Nie udało się usunąć obiektu');
    });

    it('dismisses the delete dialog without deleting', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Usuń', detailsPanel(fixture));
      pressButton(fixture, 'Anuluj', deletePanel(fixture));

      httpMock.expectNone('/api/buildings/b1');
      expect(fixture.componentInstance.deleteTarget()).toBeNull();
    });

    it('toggles a size off when its checkbox is cleared', async () => {
      const fixture = await render([facility()]);

      pressButton(fixture, 'Edytuj', detailsPanel(fixture));
      // The seeded facility has 1/1 and 1/2; clearing 1/1 leaves 1/2.
      setCheckbox(fixture, '1/1', false, formPanel(fixture));

      expect(fixture.componentInstance.facilityForm().sizes).toEqual(['1/2']);
    });

    it('ignores a delete confirmation with no target', async () => {
      const fixture = await render([facility()]);

      fixture.componentInstance.confirmDelete();

      httpMock.expectNone('/api/buildings/b1');
    });
  });
});
