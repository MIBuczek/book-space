import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {throwError} from 'rxjs';
import {IBuilding} from '@models/building.model';
import {SessionStore} from '../../../core/session.store';
import {adminUser, employeeUser, makeCapabilities, makeUser} from '../../../../testing/fixtures';
import {FacilitiesTabComponent} from './facilities-tab.component';

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

  const setSelect = (fixture: Fixture, label: string, value: string): void => {
    const select = control(fixture, label) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const setText = (fixture: Fixture, label: string, value: string): void => {
    const input = control(fixture, label) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
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
});
