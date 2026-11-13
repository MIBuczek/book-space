import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IPublicBuilding} from '@models/building.model';
import {IBooking} from '@models/booking.model';
import {SessionStore} from '../../core/session.store';
import {employeeUser} from '../../../testing/fixtures';
import {provideTestI18n} from '../../../testing/i18n-testing';
import {PublicCalendarComponent} from './public-calendar.component';

const facility = (
  property: string,
  city: IPublicBuilding['city'],
  name: string
): IPublicBuilding => ({
  _id: property,
  name,
  property,
  city,
  sizes: ['1/1'],
  lighting: true,
  toilets: true,
});

const FACILITIES: IPublicBuilding[] = [
  facility('hala-sportowa', 'siechnice', 'Hala Sportowa'),
  facility('sala-a', 'siechnice', 'Sala A'),
  facility('hala-radwanice', 'radwanice', 'Hala Radwanice'),
];

const booking = (overrides: Partial<IBooking> = {}): IBooking => ({
  _id: 'b1',
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Klub Pływacki',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '600100200',
  month: 0,
  bookedTimes: [
    {
      day: new Date('2026-03-10T00:00:00.000Z'),
      startHours: new Date('2026-03-10T08:00:00.000Z'),
      endHours: new Date('2026-03-10T10:00:00.000Z'),
      status: 'INITIAL',
    },
  ],
  accepted: true,
  archive: false,
  paymentMethod: 'CASH',
  extraOptions: false,
  selectedOptions: [],
  ...overrides,
});

const page = (items: IBooking[]) => ({items, total: items.length, page: 1, limit: 50});

describe('PublicCalendarComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PublicCalendarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /**
   * Renders the component and lets the facility list arrive.
   *
   * The bookings request is issued by a resource whose params depend on the selected
   * facility, so it appears one microtask after the facility flush — `await Promise.resolve()`
   * drains that, then `detectChanges` runs the effects. Under zoneless there is no zone to do
   * either for us.
   *
   * The anchor is pinned to noon on 10 March 2026 (a Tuesday) so the loaded week is fixed and
   * the fixture's Tuesday slot falls inside it; the default `now` would make the assertion
   * depend on the day the suite runs.
   */
  const ANCHOR = new Date('2026-03-10T12:00:00.000Z');

  const render = async (facilities: IPublicBuilding[] = FACILITIES) => {
    const fixture = TestBed.createComponent(PublicCalendarComponent);
    fixture.componentInstance.anchor.set(ANCHOR);
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(facilities);
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  };

  const bookingsRequest = () => httpMock.expectOne((request) => request.url === '/api/bookings');

  const settle = async (fixture: ReturnType<typeof TestBed.createComponent<PublicCalendarComponent>>) => {
    await Promise.resolve();
    fixture.detectChanges();
  };

  const buttonByText = (fixture: ReturnType<typeof TestBed.createComponent<PublicCalendarComponent>>, label: string) =>
    Array.from(
      fixture.nativeElement.querySelectorAll('book-space-button') as NodeListOf<HTMLElement>
    )
      .find((button) => button.textContent?.includes(label))
      ?.querySelector('button');

  it('loads the facilities and requests the week of the first facility', async () => {
    const fixture = await render();
    const request = bookingsRequest();
    const params = request.request.params;
    expect(params.get('city')).toBe('siechnice');
    expect(params.get('building')).toBe('hala-sportowa');
    expect(params.get('from')).not.toBeNull();
    expect(params.get('to')).not.toBeNull();
    request.flush(page([]));
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Kalendarz rezerwacji obiektów'
    );
  });

  it('renders an event for a booking in the grid', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Klub Pływacki');
    // 08:00Z and 10:00Z are 09:00 and 11:00 in Europe/Warsaw in March (UTC+1).
    expect(text).toContain('09:00–11:00');
  });

  it('shows the nickname to the public and the tenant name to staff', async () => {
    const publicFixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(publicFixture);
    expect((publicFixture.nativeElement as HTMLElement).textContent).toContain('Klub Pływacki');
    expect((publicFixture.nativeElement as HTMLElement).textContent).not.toContain('Jan Kowalski');
  });

  it('reports no events while the bookings read is in flight', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.events()).toEqual([]);
    bookingsRequest().flush(page([]));
    await settle(fixture);
  });

  it('labels a staff event with the tenant name', async () => {
    TestBed.inject(SessionStore).set('token', employeeUser());
    const fixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Jan Kowalski');
  });

  it('resets the facility when the city changes and refetches', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    const selects = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    selects[0].value = 'radwanice';
    selects[0].dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(bookingsRequest().request.params.get('building')).toBe('hala-radwanice');
  });

  it('selects a facility from the second selector', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    const selects = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    selects[1].value = 'sala-a';
    selects[1].dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(bookingsRequest().request.params.get('building')).toBe('sala-a');
  });

  it('keeps the chosen facility when the facility list refreshes', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    const selects = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    selects[1].value = 'sala-a';
    selects[1].dispatchEvent(new Event('change'));
    await settle(fixture);
    bookingsRequest().flush(page([]));
    await settle(fixture);

    fixture.componentInstance.facilitiesResource.reload();
    // `reload()` schedules through RxJS's async scheduler, so a macrotask has to drain
    // before the request is observable (a microtask is enough for the first read). The
    // response is a fresh array, as a real HTTP response is — the same reference would let
    // `buildingOptions` stay memoised and hide the keep-the-selection path.
    await new Promise((resolve) => setTimeout(resolve));
    httpMock.expectOne('/api/buildings').flush(FACILITIES.map((facility) => ({...facility})));
    await settle(fixture);

    expect(fixture.componentInstance.building()).toBe('sala-a');
  });

  it('loads a single facility-local day in the day view', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    buttonByText(fixture, 'Dzień')?.click();
    await settle(fixture);

    // The anchor's facility-local day is 10 March 2026, which is 09 Mar 23:00Z – 10 Mar
    // 22:59:59.999Z in Europe/Warsaw. The day view loads exactly that day.
    const request = bookingsRequest();
    expect(request.request.params.get('from')).toBe('2026-03-09T23:00:00.000Z');
    expect(request.request.params.get('to')).toBe('2026-03-10T22:59:59.999Z');
  });

  it('renders the month list with its label', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    buttonByText(fixture, 'Miesiąc')?.click();
    await settle(fixture);
    bookingsRequest().flush(page([]));
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Brak rezerwacji w wybranym okresie.');
    expect(text).toMatch(
      /styczeń|luty|marzec|kwiecień|maj|czerwiec|lipiec|sierpień|wrzesień|październik|listopad|grudzień/
    );
  });

  it('shows the public notice to an anonymous caller', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'tylko zatwierdzone przez administratora rezerwacje'
    );
  });

  it('hides the public notice from staff', async () => {
    TestBed.inject(SessionStore).set('token', employeeUser());
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'tylko zatwierdzone przez administratora rezerwacje'
    );
  });

  it('shows the booking details, including client fields, when a staff member selects an event', async () => {
    TestBed.inject(SessionStore).set('token', employeeUser());
    const fixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(fixture);

    (fixture.nativeElement.querySelector('.bs-event') as HTMLButtonElement).click();
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Szczegóły rezerwacji');
    expect(text).toContain('jan@example.com');
  });

  it('omits the client fields from the details for a public caller', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(fixture);

    (fixture.nativeElement.querySelector('.bs-event') as HTMLButtonElement).click();
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Szczegóły rezerwacji');
    expect(text).not.toContain('jan@example.com');
  });

  it('closes the details panel', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([booking()]));
    await settle(fixture);
    (fixture.nativeElement.querySelector('.bs-event') as HTMLButtonElement).click();
    await settle(fixture);

    buttonByText(fixture, 'Zamknij')?.click();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Szczegóły rezerwacji'
    );
  });

  it('shows an error message when the bookings read fails', async () => {
    const fixture = await render();
    bookingsRequest().flush({}, {status: 500, statusText: 'Internal Server Error'});
    await settle(fixture);

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Nie udało się wczytać rezerwacji');
  });

  it('prompts for a facility when the selected city has none', async () => {
    const fixture = await render([facility('hala-radwanice', 'radwanice', 'Hala Radwanice')]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Wybierz obiekt, aby zobaczyć kalendarz.'
    );
  });

  it('moves the period forward', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    buttonByText(fixture, 'Następny')?.click();
    await settle(fixture);

    expect(bookingsRequest()).toBeTruthy();
  });

  it('returns to the current period', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);

    buttonByText(fixture, 'Dzisiaj')?.click();
    await settle(fixture);

    expect(bookingsRequest()).toBeTruthy();
  });

  it('switches to the week view from the day view', async () => {
    const fixture = await render();
    bookingsRequest().flush(page([]));
    await settle(fixture);
    buttonByText(fixture, 'Dzień')?.click();
    await settle(fixture);
    bookingsRequest().flush(page([]));
    await settle(fixture);

    buttonByText(fixture, 'Tydzień')?.click();
    await settle(fixture);

    expect(bookingsRequest()).toBeTruthy();
  });
});
