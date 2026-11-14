import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IPublicBuilding} from '@models/building.model';
import {IBookingRequest} from '@models/booking.model';
import {provideTestI18n} from '../../../testing/i18n-testing';
import {BookingRequestComponent} from './booking-request.component';

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
  sizes: ['1/1', '1/2'],
  lighting: false,
  toilets: false,
  ...overrides,
});

const FACILITIES: IPublicBuilding[] = [
  facility('hala-sportowa', 'siechnice', 'Hala Sportowa'),
  facility('sala-a', 'siechnice', 'Sala A', {sizes: ['1/2']}),
  facility('boisko-sztuczna-nawierzchnia', 'siechnice', 'Boisko', {
    lighting: true,
    toilets: true,
  }),
  facility('hala-radwanice', 'radwanice', 'Hala Radwanice'),
];

const createdBooking = (): object => ({_id: 'b1'});

describe('BookingRequestComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BookingRequestComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  const render = async (facilities: IPublicBuilding[] = FACILITIES) => {
    const fixture = TestBed.createComponent(BookingRequestComponent);
    fixture.componentInstance.draftDay.set(new Date('2026-06-01T12:00:00Z'));
    fixture.componentInstance.cyclicalEndDay.set(new Date('2026-06-22T12:00:00Z'));
    fixture.detectChanges();
    httpMock.expectOne('/api/buildings').flush(facilities);
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  };

  type Fixture = Awaited<ReturnType<typeof render>>;

  const element = (fixture: Fixture): HTMLElement => fixture.nativeElement as HTMLElement;

  /** The control inside the labelled field whose label text matches. */
  const control = (fixture: Fixture, label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
    const wrapper = Array.from(
      element(fixture).querySelectorAll<HTMLElement>('label')
    ).find((candidate) => candidate.textContent?.includes(label));
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
    const input = control(fixture, label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const setDate = (fixture: Fixture, label: string, value: string): void => {
    const input = control(fixture, label) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const setCheckbox = (fixture: Fixture, label: string, checked: boolean): void => {
    const input = control(fixture, label) as HTMLInputElement;
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const pressButton = (fixture: Fixture, label: string): void => {
    const host = Array.from(element(fixture).querySelectorAll<HTMLElement>('book-space-button')).find(
      (candidate) => candidate.textContent?.includes(label)
    );
    if (!host) {
      throw new Error(`No button labelled "${label}"`);
    }
    host.querySelector('button')?.click();
    fixture.detectChanges();
  };

  const fillRequired = (fixture: Fixture): void => {
    setText(fixture, 'Nazwa w kalendarzu', 'Klub Pływacki');
    setText(fixture, 'Imię i nazwisko', 'Jan Kowalski');
    setText(fixture, 'E-mail', 'jan@example.com');
    setText(fixture, 'Telefon', '600100200');
  };

  const addSlot = (fixture: Fixture): void => {
    pressButton(fixture, 'Dodaj termin');
  };

  const submit = (fixture: Fixture): void => {
    const form = element(fixture).querySelector('form');
    form?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  const bookingRequest = () => httpMock.expectOne((request) => request.url === '/api/bookings');

  it('loads the facilities and offers their sizes', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.sizeSelectOptions().map((option) => option.value)).toEqual([
      '1/1',
      '1/2',
    ]);
    expect(element(fixture).textContent).toContain('Prośba o rezerwację');
  });

  it('restricts the size options to the selected facility', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'sala-a');
    expect(fixture.componentInstance.sizeSelectOptions().map((option) => option.value)).toEqual([
      '1/2',
    ]);
  });

  it('resets the facility when the city changes', async () => {
    const fixture = await render();
    setSelect(fixture, 'Miasto', 'radwanice');
    expect(fixture.componentInstance.facilityProperty()).toBe('hala-radwanice');
  });

  it('keeps the chosen facility when the facility list refreshes', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'sala-a');

    fixture.componentInstance.facilitiesResource.reload();
    await new Promise((resolve) => setTimeout(resolve));
    httpMock.expectOne('/api/buildings').flush(FACILITIES.map((facility) => ({...facility})));
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.facilityProperty()).toBe('sala-a');
  });

  it('shows the company field only for a company booking', async () => {
    const fixture = await render();
    expect(element(fixture).textContent).not.toContain('Nazwa firmy');
    setSelect(fixture, 'Typ', 'COMPANY');
    expect(element(fixture).textContent).toContain('Nazwa firmy');
  });

  it('records the payment method and the discount', async () => {
    const fixture = await render();
    setSelect(fixture, 'Płatność', 'CASH');
    setText(fixture, 'Rabat (opcjonalnie)', '10%');
    expect(fixture.componentInstance.value().paymentMethod).toBe('CASH');
    expect(fixture.componentInstance.value().discount).toBe('10%');
  });

  it('adds a plain slot and shows it', async () => {
    const fixture = await render();
    addSlot(fixture);
    expect(fixture.componentInstance.slots()).toHaveLength(1);
    expect(element(fixture).textContent).toContain('2026-06-01');
  });

  it('refuses a slot whose end is not after its start', async () => {
    const fixture = await render();
    setSelect(fixture, 'Od godziny', '12');
    setSelect(fixture, 'Do godziny', '10');
    addSlot(fixture);
    expect(fixture.componentInstance.slots()).toHaveLength(0);
    expect(element(fixture).textContent).toContain('Godzina zakończenia');
  });

  it('expands a cyclical entry into its weekly series', async () => {
    const fixture = await render();
    setCheckbox(fixture, 'Rezerwacja cykliczna', true);
    setDate(fixture, 'Do dnia', '2026-06-22');
    addSlot(fixture);
    expect(fixture.componentInstance.slots()).toHaveLength(4);
  });

  it('refuses a cyclical series that ends before it starts', async () => {
    const fixture = await render();
    setCheckbox(fixture, 'Rezerwacja cykliczna', true);
    setDate(fixture, 'Do dnia', '2026-05-01');
    addSlot(fixture);
    expect(fixture.componentInstance.slots()).toHaveLength(0);
    expect(element(fixture).textContent).toContain('nie może być wcześniejsza');
  });

  it('warns when the added slots overlap, and does not warn otherwise', async () => {
    const fixture = await render();
    addSlot(fixture);
    expect(fixture.componentInstance.overlapWarning()).toBeNull();
    setSelect(fixture, 'Do godziny', '12');
    addSlot(fixture);
    expect(fixture.componentInstance.overlapWarning()).not.toBeNull();
    expect(element(fixture).textContent).toContain('konfliktują ze sobą');
  });

  it('removes the last plain slot', async () => {
    const fixture = await render();
    addSlot(fixture);
    pressButton(fixture, 'Usuń ostatni termin');
    expect(fixture.componentInstance.slots()).toHaveLength(0);
  });

  it('offers the add-ons only for a facility that supports them', async () => {
    const fixture = await render();
    expect(element(fixture).textContent).not.toContain('Dodatkowe opcje wynajmu');
    setSelect(fixture, 'Obiekt', 'boisko-sztuczna-nawierzchnia');
    expect(element(fixture).textContent).toContain('Dodatkowe opcje wynajmu');
  });

  it('adds and removes an extra option', async () => {
    const fixture = await render();
    setSelect(fixture, 'Obiekt', 'boisko-sztuczna-nawierzchnia');
    setCheckbox(fixture, 'Oświetlenie', true);
    pressButton(fixture, 'Dodaj opcję');
    expect(fixture.componentInstance.extraOptions()).toHaveLength(1);
    expect(element(fixture).textContent).toContain('Oświetlenie');
    fixture.componentInstance.removeExtraOption(0);
    expect(fixture.componentInstance.extraOptions()).toHaveLength(0);
  });

  it('describes an add-on with lighting, with the sanitary back-of-house, and with neither', async () => {
    const fixture = await render();
    const day = new Date('2026-06-01T12:00:00Z');
    expect(
      fixture.componentInstance.describeExtraOption({day, fromHour: 9, toHour: 10, lights: true, toilets: false})
    ).toContain('Oświetlenie');
    expect(
      fixture.componentInstance.describeExtraOption({day, fromHour: 9, toHour: 10, lights: false, toilets: true})
    ).toContain('Zaplecze sanitarne');
    expect(
      fixture.componentInstance.describeExtraOption({day, fromHour: 9, toHour: 10, lights: true, toilets: true})
    ).toContain('Oświetlenie, Zaplecze sanitarne');
  });

  it('disables the submit button until the RODO clause is accepted and a slot exists', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    addSlot(fixture);
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    expect(fixture.componentInstance.canSubmit()).toBe(true);
  });

  it('reports the required fields only after a submit attempt', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.errors()).toEqual({});
    submit(fixture);
    expect(fixture.componentInstance.errors().nick).toBeDefined();
  });

  it('refuses to submit without a facility', async () => {
    const fixture = await render([]);
    fillRequired(fixture);
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);
    expect(element(fixture).textContent).toContain('Wybierz obiekt');
  });

  it('refuses to submit an invalid form and posts nothing', async () => {
    const fixture = await render();
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);
    httpMock.expectNone('/api/bookings');
  });

  it('posts the request and shows the confirmation', async () => {
    const fixture = await render();
    fillRequired(fixture);
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);

    const request = bookingRequest();
    expect(request.request.method).toBe('POST');
    const body = request.request.body as IBookingRequest;
    expect(body.place).toEqual({place: 'hala-sportowa', city: 'siechnice'});
    expect(body.bookedTimes).toHaveLength(1);
    expect(body.rodoAcknowledgement).toBe(true);

    request.flush(createdBooking());
    fixture.detectChanges();
    expect(element(fixture).textContent).toContain('Dziękujemy');
  });

  it('renders the bot-mitigation decoy off-screen and outside the keyboard order (FR-049)', async () => {
    const fixture = await render();
    const decoy = element(fixture).querySelector('.bs-request__decoy');

    expect(decoy).not.toBeNull();
    expect(decoy?.getAttribute('aria-hidden')).toBe('true');
    expect(decoy?.querySelector('input')?.getAttribute('tabindex')).toBe('-1');
  });

  it('sends the decoy empty for a real visitor', async () => {
    const fixture = await render();
    fillRequired(fixture);
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);

    const request = bookingRequest();
    expect((request.request.body as IBookingRequest).website).toBe('');
    request.flush(createdBooking());
  });

  it('reports a validation failure from the server', async () => {
    const fixture = await render();
    fillRequired(fixture);
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);
    bookingRequest().flush(
      {statusCode: 422, message: ['bad'], error: 'Unprocessable Entity'},
      {status: 422, statusText: 'Unprocessable Entity'}
    );
    fixture.detectChanges();
    expect(element(fixture).textContent).toContain('Sprawdź dane');
  });

  it('reports a transport failure', async () => {
    const fixture = await render();
    fillRequired(fixture);
    addSlot(fixture);
    setCheckbox(fixture, 'Akceptuję klauzulę informacyjną RODO', true);
    submit(fixture);
    bookingRequest().error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element(fixture).textContent).toContain('Spróbuj ponownie później');
  });

  it('formats a day and an hour for the slot list', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.formatDay(new Date('2026-06-01T12:00:00Z'))).toBe('2026-06-01');
    expect(fixture.componentInstance.formatHour(new Date('2026-06-01T07:00:00Z'))).toBe('09:00');
  });

  it('renders a select value as a string and parses it back', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.hourValue(9)).toBe('9');
    expect(fixture.componentInstance.parseHour('9')).toBe(9);
  });
});
