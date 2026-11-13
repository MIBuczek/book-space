import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IPublicBuilding} from '@models/building.model';
import {IBooking} from '@models/booking.model';
import {IBookedTime} from '@models/booked-time.model';
import {IPaginated} from '@models/pagination.model';
import {SessionStore} from '../../../core/session.store';
import {adminUser, employeeUser, makeUser} from '../../../../testing/fixtures';
import {BookingsTableComponent} from './bookings-table.component';
import {provideTestI18n} from '../../../../testing/i18n-testing';

const facility = (
  property: string,
  city: IPublicBuilding['city'],
  name: string,
  overrides: Partial<IPublicBuilding> = {}
): IPublicBuilding => ({
  _id: property,
  name,
  property,
  city,
  sizes: ['1/1'],
  lighting: false,
  toilets: false,
  ...overrides,
});

const FACILITIES: IPublicBuilding[] = [
  facility('hala-sportowa', 'siechnice', 'Hala Sportowa'),
  facility('sala-a', 'siechnice', 'Sala A'),
  facility('hala-radwanice', 'radwanice', 'Hala Radwanice'),
];

const slot = (overrides: Partial<IBookedTime> = {}): IBookedTime => ({
  day: new Date('2026-08-03T22:00:00.000Z'),
  startHours: new Date('2026-08-03T23:00:00.000Z'),
  endHours: new Date('2026-08-04T00:00:00.000Z'),
  status: 'INITIAL',
  ...overrides,
});

const booking = (overrides: Partial<IBooking> = {}): IBooking => ({
  _id: 'b1',
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Klub',
  personName: 'Jan Kowalski',
  personCompany: 'Klub Sportowy',
  personEmail: 'jan@example.com',
  personPhone: '600100200',
  month: 7,
  bookedTimes: [slot()],
  accepted: false,
  archive: false,
  extraOptions: false,
  selectedOptions: [],
  paymentMethod: 'CASH',
  comments: 'Uwagi',
  ...overrides,
});

const page = (items: IBooking[], total = items.length): IPaginated<IBooking> => ({
  items,
  total,
  page: 1,
  limit: 20,
});

describe('BookingsTableComponent', () => {
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BookingsTableComponent],
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
    httpMock.expectOne((request) => request.url === '/api/bookings' && request.method === 'GET');

  const conflictsRequest = () =>
    httpMock.expectOne(
      (request) => request.url === '/api/bookings/conflicts' && request.method === 'GET'
    );

  /** Flushes the list + conflict reload pair a write triggers. */
  const flushReload = async (items: IBooking[] = [], conflicts: string[] = []): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    listRequest().flush(page(items));
    conflictsRequest().flush(conflicts);
    await Promise.resolve();
  };

  const render = async (
    bookings: IBooking[] = [booking()],
    conflicts: string[] = [],
    user = adminUser()
  ) => {
    session.set('token', user);
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(FACILITIES);
    await Promise.resolve();
    fixture.detectChanges();

    listRequest().flush(page(bookings));
    if (user.capabilities.canSeeConflicts) {
      conflictsRequest().flush(conflicts);
    }
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

  const setSelect = (
    fixture: Fixture,
    label: string,
    value: string,
    root: ParentNode = element(fixture)
  ): void => {
    const select = control(fixture, label, root) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const setText = (fixture: Fixture, label: string, value: string): void => {
    const input = control(fixture, label) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const setCheckbox = (fixture: Fixture, label: string, checked: boolean): void => {
    const input = control(fixture, label) as HTMLInputElement;
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

  /** The one dialog a press has opened; the four modals are always mounted, only one open. */
  const openPanel = (fixture: Fixture): ParentNode => {
    const dialog = element(fixture).querySelector('dialog[open]');
    if (!dialog) {
      throw new Error('No open dialog');
    }
    return dialog;
  };

  it('loads the facilities and lists the bookings of the first facility', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.buildingOptions().map((option) => option.value)).toEqual([
      'hala-sportowa',
      'sala-a',
    ]);
    expect(element(fixture).textContent).toContain('Klub');
  });

  it('sends the facility, the period and the page as query parameters', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(FACILITIES);
    await Promise.resolve();
    fixture.detectChanges();

    const request = listRequest();
    expect(request.request.params.get('city')).toBe('siechnice');
    expect(request.request.params.get('building')).toBe('hala-sportowa');
    expect(request.request.params.get('all')).toBe('true');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('limit')).toBe('20');
    request.flush(page([booking()]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('resets the facility and reloads when the city changes', async () => {
    const fixture = await render();
    setSelect(fixture, 'Miasto', 'radwanice');

    const request = listRequest();
    expect(request.request.params.get('building')).toBe('hala-radwanice');
    request.flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('sends the search term', async () => {
    const fixture = await render();

    setText(fixture, 'Wyszukaj rezerwację', 'Kowalski');
    await Promise.resolve();
    const request = listRequest();
    expect(request.request.params.get('search')).toBe('Kowalski');
    request.flush(page([]));
    // The conflict scope is unchanged, so `rxResource` does not re-run it.
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('sends the unapproved filter', async () => {
    const fixture = await render();

    setCheckbox(fixture, 'Pokaż rezerwacje do zaakceptowania', true);
    await Promise.resolve();
    const request = listRequest();
    expect(request.request.params.get('accepted')).toBe('false');
    request.flush(page([]));
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('loads the selected academic year when the period changes', async () => {
    const fixture = await render();
    setSelect(fixture, 'Okres', '2025');

    const request = listRequest();
    expect(request.request.params.get('from')).toBe('2025-07-31T22:00:00.000Z');
    expect(request.request.params.get('to')).toBe('2026-08-31T21:59:59.999Z');
    expect(request.request.params.get('all')).toBe('false');
    request.flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('changes the page size and returns to the first page', async () => {
    const fixture = await render();
    fixture.componentInstance.onPage(2);
    fixture.detectChanges();
    await Promise.resolve();
    const pageTwo = listRequest();
    expect(pageTwo.request.params.get('page')).toBe('2');
    pageTwo.flush(page([]));
    await Promise.resolve();
    fixture.detectChanges();

    fixture.componentInstance.onLimit('50');
    fixture.detectChanges();
    await Promise.resolve();
    const resized = listRequest();
    expect(resized.request.params.get('limit')).toBe('50');
    expect(resized.request.params.get('page')).toBe('1');
    resized.flush(page([]));
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('marks a conflicting unaccepted booking and shows the counter', async () => {
    const fixture = await render([booking({_id: 'b1'})], ['b1']);

    expect(fixture.componentInstance.conflictCount()).toBe(1);
    expect(fixture.componentInstance.rows()[0]['conflictLabel']).toBe('Konflikt');
    expect(element(fixture).textContent).toContain('Aktualna liczba konfliktów między rezerwacjami: 1');
  });

  it('does not fetch conflicts for a caller who may not see them', async () => {
    // `render` only flushes the conflicts request when the capability is present; the
    // employee fixture has it off, and `httpMock.verify()` proves none was sent.
    const fixture = await render([booking()], [], employeeUser());

    expect(fixture.componentInstance.canSeeConflicts()).toBe(false);
    expect(element(fixture).textContent).not.toContain('Aktualna liczba konfliktów');
  });

  it('hides the unapproved filter from a caller without the capability', async () => {
    const fixture = await render([booking()], [], employeeUser());

    expect(element(fixture).textContent).not.toContain('Pokaż rezerwacje do zaakceptowania');
  });

  it('approves an unconflicted booking directly', async () => {
    const fixture = await render([booking({_id: 'b1', accepted: false})], []);

    pressButton(fixture, 'Zatwierdź');

    const request = httpMock.expectOne('/api/bookings/b1/approve');
    expect(request.request.body).toEqual({accepted: true, force: false});
    request.flush({booking: booking({accepted: true}), conflicts: []});

    await flushReload([booking({accepted: true})]);
  });

  it('asks before approving a conflicting booking and forces on confirmation', async () => {
    const fixture = await render([booking({_id: 'b1', accepted: false})], ['b1']);

    pressButton(fixture, 'Zatwierdź');
    expect(element(fixture).textContent).toContain('konfliktuje z innymi rezerwacjami');

    pressButton(fixture, 'Zatwierdź mimo konfliktu');

    const request = httpMock.expectOne('/api/bookings/b1/approve');
    expect(request.request.body).toEqual({accepted: true, force: true});
    request.flush({booking: booking({accepted: true}), conflicts: ['b1']});

    await flushReload([booking({accepted: true})]);
  });

  it('cancels a pending conflict approval without sending a request', async () => {
    const fixture = await render([booking({_id: 'b1', accepted: false})], ['b1']);

    pressButton(fixture, 'Zatwierdź');
    pressButton(fixture, 'Anuluj');

    expect(fixture.componentInstance.approvalWarning()).toBeNull();
    httpMock.expectNone('/api/bookings/b1/approve');
  });

  it('unapproves an accepted booking', async () => {
    const fixture = await render([booking({_id: 'b1', accepted: true})], []);

    pressButton(fixture, 'Odwołaj');

    const request = httpMock.expectOne('/api/bookings/b1/approve');
    expect(request.request.body).toEqual({accepted: false, force: false});
    request.flush({booking: booking(), conflicts: []});

    await flushReload([booking()]);
  });

  it('archives and restores a booking', async () => {
    const fixture = await render([booking({_id: 'b1', archive: false})], []);

    pressButton(fixture, 'Archiwizuj');
    const archive = httpMock.expectOne('/api/bookings/b1/archive');
    expect(archive.request.body).toEqual({archive: true});
    archive.flush(booking({archive: true}));

    await flushReload([booking({archive: true})]);
    fixture.detectChanges();

    pressButton(fixture, 'Przywróć');
    const restore = httpMock.expectOne('/api/bookings/b1/archive');
    expect(restore.request.body).toEqual({archive: false});
    restore.flush(booking());

    await flushReload([booking()]);
  });

  it('edits a booking through the generic update', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    pressButton(fixture, 'Edytuj');
    setText(fixture, 'Nazwa w kalendarzu', 'Nowa nazwa');
    setText(fixture, 'Imię i nazwisko', 'Anna Nowak');
    setText(fixture, 'Telefon', '111222333');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/bookings/b1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      nick: 'Nowa nazwa',
      personName: 'Anna Nowak',
      personPhone: '111222333',
    });
    request.flush(booking());

    await flushReload([booking()]);
  });

  it('cancels an edit without sending a request', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    pressButton(fixture, 'Edytuj');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.editTarget()).toBeNull();
    httpMock.expectNone('/api/bookings/b1');
  });

  it('opens the edit dialog modally, and Esc clears the pending target (NFR-006)', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    pressButton(fixture, 'Edytuj');
    const dialog = openPanel(fixture) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    // `aria-modal` is what tells a screen reader the rest of the page is inert; the native
    // `showModal()` makes that true, and the attribute is what exposes it.
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    // `Esc` closes a native modal and the browser fires `close`; the component turns that
    // into the caller clearing its state, so a dismissed dialog cannot leave a stale edit.
    dialog.dispatchEvent(new Event('close'));
    fixture.detectChanges();

    expect(fixture.componentInstance.editTarget()).toBeNull();
    expect(dialog.open).toBe(false);
    httpMock.expectNone('/api/bookings/b1');
  });

  it('resolves a slot and sends the whole replacement list', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Rozlicz');

    setSelect(fixture, 'Status', 'DONE');
    setText(fixture, 'Uczestnicy', '5');
    setText(fixture, 'Komentarz', 'ok');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/bookings/b1/booked-times');
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as IBookedTime[];
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('DONE');
    expect(body[0].participants).toBe(5);
    expect(body[0].comments).toBe('ok');
    request.flush({});

    await flushReload([booking()]);
  });

  it('does not offer the resolve action for an already-resolved slot (FR-018)', async () => {
    const fixture = await render([booking({_id: 'b1', bookedTimes: [slot({status: 'DONE'})]})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);

    expect(element(fixture).textContent).toContain('Slot rozliczony');
    expect(element(fixture).textContent).not.toContain('Rozlicz');
  });

  it('cancels a resolve without sending a request', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Rozlicz');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.resolveTarget()).toBeNull();
    httpMock.expectNone('/api/bookings/b1/booked-times');
  });

  it('deletes a booking after confirmation', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    // Rejecting a request is this delete (#196), so the affordance names both readings.
    pressButton(fixture, 'Usuń / Odrzuć');
    expect(element(fixture).textContent).toContain(
      'Czy na pewno chcesz usunąć tą rezerwację? Odrzucenie wniosku usuwa go bezpowrotnie.'
    );
    pressButton(fixture, 'Usuń / Odrzuć', openPanel(fixture));

    const request = httpMock.expectOne(
      (r) => r.url === '/api/bookings/b1' && r.method === 'DELETE'
    );
    request.flush({});

    await flushReload([]);
  });

  it('cancels a delete without sending a request', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    pressButton(fixture, 'Usuń / Odrzuć');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.deleteTarget()).toBeNull();
    httpMock.expectNone((r) => r.url === '/api/bookings/b1' && r.method === 'DELETE');
  });

  it('shows the list error state when the read fails', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(FACILITIES);
    await Promise.resolve();
    fixture.detectChanges();

    listRequest().flush({message: 'boom'}, {status: 500, statusText: 'Server Error'});
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Nie udało się wczytać rezerwacji.');
  });

  it('asks the administrator to pick a facility when the city has none', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    // Only Radwanice has a facility, so selecting Siechnice yields no options and an empty key.
    httpMock.expectOne('/api/buildings').flush([FACILITIES[2]]);
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Wybierz obiekt, aby zobaczyć rezerwacje.');
  });

  it('expands and collapses every booking\u2019s details', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    expect(element(fixture).textContent).toContain('Jan Kowalski');

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', false);
    expect(fixture.componentInstance.showDetails()).toBe(false);
  });

  it('changes the facility through the selector', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'sala-a');

    const request = listRequest();
    expect(request.request.params.get('building')).toBe('sala-a');
    request.flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('keeps the selected facility when the facility list refreshes', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'sala-a');

    const request = listRequest();
    request.flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();

    // A fresh array, as a real response is — the same reference would let the computed
    // stay memoised and hide the keep-the-selection path.
    fixture.componentInstance.facilities.set(FACILITIES.map((facility) => ({...facility})));
    fixture.detectChanges();

    expect(fixture.componentInstance.building()).toBe('sala-a');
  });

  it('falls back to the first facility when the selected one disappears', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'sala-a');
    listRequest().flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();

    fixture.componentInstance.facilities.set(FACILITIES.filter((f) => f.property !== 'sala-a'));
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.building()).toBe('hala-sportowa');
    listRequest().flush(page([]));
    conflictsRequest().flush([]);
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('reports an empty list and total before the read resolves', async () => {
    session.set('token', adminUser());
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    // Only Radwanice has a facility, so the selected city yields no building and no read.
    httpMock.expectOne('/api/buildings').flush([FACILITIES[2]]);
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(fixture.componentInstance.total()).toBe(0);
  });

  it('treats an absent session as no capability at all', async () => {
    // No `session.set`, so `capabilities()` is null and every flag fails closed.
    session.clear();
    const fixture = TestBed.createComponent(BookingsTableComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(FACILITIES);
    await Promise.resolve();
    fixture.detectChanges();
    listRequest().flush(page([booking()]));
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.canApproveBookings()).toBe(false);
    expect(fixture.componentInstance.canFilterUnapproved()).toBe(false);
    expect(fixture.componentInstance.canSeeConflicts()).toBe(false);
  });

  it('ignores a confirmation or a cancel with nothing pending', async () => {
    const fixture = await render();

    fixture.componentInstance.confirmApproval();
    fixture.componentInstance.cancelApproval();
    fixture.componentInstance.confirmEdit();
    fixture.componentInstance.confirmResolve();
    fixture.componentInstance.confirmDelete();

    expect(fixture.componentInstance.approvalWarning()).toBeNull();
    httpMock.expectNone('/api/bookings/b1/approve');
    httpMock.expectNone('/api/bookings/b1');
    httpMock.expectNone('/api/bookings/b1/booked-times');
  });

  it('resolves a slot with no participants or comment', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Rozlicz');
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/bookings/b1/booked-times');
    const body = request.request.body as IBookedTime[];
    expect(body[0].status).toBe('INITIAL');
    expect(body[0].participants).toBeUndefined();
    expect(body[0].comments).toBeUndefined();
    request.flush({});

    await flushReload([booking()]);
  });

  it('prefills the resolve editor from an existing slot value', async () => {
    const fixture = await render(
      [booking({_id: 'b1', bookedTimes: [slot({participants: 3, comments: 'x'})]})],
      []
    );

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Rozlicz');

    expect(fixture.componentInstance.resolveParticipants()).toBe('3');
    expect(fixture.componentInstance.resolveComments()).toBe('x');
  });

  it('reschedules a slot to a new day and hour', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Przenieś');

    setSelect(fixture, 'Od', '10', openPanel(fixture));
    setSelect(fixture, 'Do', '12', openPanel(fixture));
    pressButton(fixture, 'Zapisz', openPanel(fixture));

    const request = httpMock.expectOne('/api/bookings/b1/booked-times');
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as IBookedTime[];
    expect(body).toHaveLength(1);
    // 10:00–12:00 on the slot's own facility-local day.
    expect(new Date(body[0].startHours).toISOString()).toBe('2026-08-04T08:00:00.000Z');
    expect(new Date(body[0].endHours).toISOString()).toBe('2026-08-04T10:00:00.000Z');
    expect(body[0].status).toBe('INITIAL');
    request.flush({});

    await flushReload([booking()]);
  });

  it('cancels a reschedule without sending a request', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    setCheckbox(fixture, 'Pokaż szczegóły rezerwacji', true);
    pressButton(fixture, 'Przenieś');
    pressButton(fixture, 'Anuluj', openPanel(fixture));

    expect(fixture.componentInstance.rescheduleTarget()).toBeNull();
    httpMock.expectNone('/api/bookings/b1/booked-times');
  });

  it('ignores a reschedule confirmation with nothing pending', async () => {
    const fixture = await render();

    fixture.componentInstance.confirmReschedule();
    fixture.componentInstance.cancelReschedule();

    expect(fixture.componentInstance.rescheduleTarget()).toBeNull();
    httpMock.expectNone('/api/bookings/b1/booked-times');
  });

  it('hides the approve and archive actions from an employee', async () => {
    const fixture = await render([booking({_id: 'b1'})], [], employeeUser());

    expect(fixture.componentInstance.canApproveBookings()).toBe(false);
    expect(fixture.componentInstance.canArchiveBookings()).toBe(false);
    expect(element(fixture).textContent).not.toContain('Zatwierdź');
    expect(element(fixture).textContent).not.toContain('Archiwizuj');
    // The applicant notification is administrator-only (FR-052), so it hides with the rest.
    expect(element(fixture).textContent).not.toContain('Powiadom wnioskującego');
  });

  it('offers the approve action to a caller with the capability', async () => {
    const office = makeUser('OFFICE', {
      capabilities: {
        ...employeeUser().capabilities,
        canApproveBookings: true,
        canArchiveBookings: true,
      },
    });
    const fixture = await render([booking({_id: 'b1'})], [], office);

    expect(element(fixture).textContent).toContain('Zatwierdź');
    expect(element(fixture).textContent).toContain('Archiwizuj');
  });

  it('notifies the applicant for the booking the action names (FR-052)', async () => {
    const fixture = await render([booking({_id: 'b1', accepted: true})], []);

    pressButton(fixture, 'Powiadom wnioskującego');

    const request = httpMock.expectOne('/api/notifications/booking');
    expect(request.request.method).toBe('POST');
    // Only the booking and the audience travel; the server resolves the recipient and the
    // approved/rejected wording from the stored booking.
    expect(request.request.body).toEqual({bookingId: 'b1', audience: 'APPLICANT'});
    request.flush({status: 'sent'});
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Powiadomienie zostało wysłane');
  });

  it('surfaces a failed applicant notification rather than swallowing it (FR-036)', async () => {
    const fixture = await render([booking({_id: 'b1'})], []);

    pressButton(fixture, 'Powiadom wnioskującego');

    const request = httpMock.expectOne('/api/notifications/booking');
    request.flush({message: 'provider down'}, {status: 502, statusText: 'Bad Gateway'});
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Nie udało się wysłać powiadomienia');
  });
});
