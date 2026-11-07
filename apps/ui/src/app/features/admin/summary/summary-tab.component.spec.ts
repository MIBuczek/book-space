import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IClient} from '@models/client.model';
import {IClientSummary} from '@models/reporting.model';
import {ReportExport} from '../../../core/report-export.service';
import {SummaryTabComponent} from './summary-tab.component';

const client = (overrides: Partial<IClient> = {}): IClient => ({
  _id: 'c1',
  type: 'COMPANY',
  name: 'Klub Sportowy',
  contactPerson: 'Jan Kowalski',
  phone: '111 222 333',
  email: 'klub@example.com',
  street: 'ul. Prosta 1',
  city: 'Wrocław',
  zipCode: '50-001',
  nip: '1234567890',
  ...overrides,
});

const summary = (): IClientSummary => ({
  client: client(),
  siechnice: [
    {
      generalBookingDetails: {
        payment: 'CASH',
        discount: '',
        extraOptions: false,
        selectedOptions: [],
        size: '1/2',
        building: 'hala-sportowa',
      },
      bookingTimeDetails: [
        {
          day: new Date('2026-03-01T10:00:00.000Z'),
          startHours: new Date('2026-03-01T10:00:00.000Z'),
          endHours: new Date('2026-03-01T11:00:00.000Z'),
          status: 'DONE',
          participants: 8,
        },
      ],
    },
  ],
  radwanice: [],
  'swieta-katarzyna': [],
  'zerniki-wroclawskie': [],
});

describe('SummaryTabComponent', () => {
  let httpMock: HttpTestingController;
  let exportService: ReportExport;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SummaryTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    exportService = TestBed.inject(ReportExport);
  });

  afterEach(() => {
    httpMock.verify();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  const clientsRequest = () =>
    httpMock.expectOne((request) => request.url === '/api/clients' && request.method === 'GET');

  const render = async () => {
    const fixture = TestBed.createComponent(SummaryTabComponent);
    fixture.detectChanges();
    // The selector loads the client list on creation; a short page ends the walk.
    clientsRequest().flush({items: [client()], total: 1, page: 1, limit: 200});
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  };

  type Fixture = Awaited<ReturnType<typeof render>>;
  const element = (fixture: Fixture): HTMLElement => fixture.nativeElement as HTMLElement;

  const button = (fixture: Fixture, label: string): HTMLButtonElement => {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label)
    );
    if (!found) {
      throw new Error(`No button labelled "${label}"`);
    }
    return found as HTMLButtonElement;
  };

  const selectClient = (fixture: Fixture, id: string): void => {
    const select = element(fixture).querySelector('select') as HTMLSelectElement;
    select.value = id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('lists the clients in the selector', async () => {
    const fixture = await render();
    const options = Array.from(element(fixture).querySelectorAll('option')).map(
      (option) => option.textContent?.trim()
    );

    expect(options).toContain('Klub Sportowy');
  });

  it('shows the empty-state prompt until a summary is generated', async () => {
    const fixture = await render();

    expect(element(fixture).textContent).toContain(
      'Aby zobaczyć podsumowanie, wybierz klienta oraz miesiąc.'
    );
  });

  it('disables generate until a client and a valid range are chosen', async () => {
    const fixture = await render();

    expect(button(fixture, 'Generuj podsumowanie').disabled).toBe(true);

    selectClient(fixture, 'c1');
    expect(button(fixture, 'Generuj podsumowanie').disabled).toBe(false);
  });

  it('generates a summary and renders the totals and the report', async () => {
    const fixture = await render();
    selectClient(fixture, 'c1');

    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/reporting/summary'
    );
    expect(request.request.params.get('clientId')).toBe('c1');
    request.flush(summary());
    await Promise.resolve();
    fixture.detectChanges();

    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Raport najmów za okres');
    expect(text).toContain('1 rezerwacji, w tym 1 zrealizowanych.');
    expect(text).toContain('Klub Sportowy');
    expect(text).toContain('Hala sportowa');
    expect(text).toContain('Zakończona');
  });

  it('shows an error message when the summary request fails', async () => {
    const fixture = await render();
    selectClient(fixture, 'c1');
    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();

    httpMock
      .expectOne((candidate) => candidate.url === '/api/reporting/summary')
      .flush('nope', {status: 500, statusText: 'Server Error'});
    await Promise.resolve();
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain('Nie udało się wygenerować podsumowania.');
  });

  it('does not reset the end month when the start month changes (the legacy bug)', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    const originalEnd = component.toMonth();

    const from = element(fixture).querySelectorAll('input[type="month"]')[0] as HTMLInputElement;
    from.value = '2026-01';
    from.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.fromMonth()?.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(component.toMonth()).toEqual(originalEnd);
  });

  it('refuses an inverted range with a message and keeps generate disabled', async () => {
    const fixture = await render();
    selectClient(fixture, 'c1');

    const inputs = element(fixture).querySelectorAll('input[type="month"]');
    // End month first, then a start month after it.
    (inputs[1] as HTMLInputElement).value = '2026-01';
    (inputs[1] as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (inputs[0] as HTMLInputElement).value = '2026-06';
    (inputs[0] as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(element(fixture).textContent).toContain(
      'Miesiąc początkowy nie może być późniejszy niż końcowy.'
    );
    expect(button(fixture, 'Generuj podsumowanie').disabled).toBe(true);
  });

  it('downloads the selected client CSV under the legacy filename', async () => {
    const fixture = await render();
    const download = jest.spyOn(exportService, 'download').mockImplementation(() => undefined);
    selectClient(fixture, 'c1');
    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();
    httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary').flush(summary());
    await Promise.resolve();
    fixture.detectChanges();

    button(fixture, 'Pobierz plik [.csv]').click();
    fixture.detectChanges();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/reporting/summary.csv'
    );
    request.flush('\uFEFFa;b\r\n');

    expect(download).toHaveBeenCalledWith(expect.stringContaining('klub sportowy'), '\uFEFFa;b\r\n');
  });

  it('downloads every client CSV without a client id', async () => {
    const fixture = await render();
    const download = jest.spyOn(exportService, 'download').mockImplementation(() => undefined);
    selectClient(fixture, 'c1');

    button(fixture, 'Pobierz raport wszystkich klientów [.csv]').click();
    fixture.detectChanges();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/reporting/summary.csv'
    );
    expect(request.request.params.has('clientId')).toBe(false);
    request.flush('\uFEFFa;b\r\n');

    expect(download).toHaveBeenCalledWith(
      expect.stringContaining('wszyscy klienci'),
      '\uFEFFa;b\r\n'
    );
  });

  it('opens the print dialog from the report button', async () => {
    const fixture = await render();
    const print = jest.spyOn(exportService, 'print').mockImplementation(() => undefined);
    selectClient(fixture, 'c1');
    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();
    httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary').flush(summary());
    await Promise.resolve();
    fixture.detectChanges();

    button(fixture, 'Wyświetl szczegóły [.pdf]').click();

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('clears the selection back to the initial state', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    selectClient(fixture, 'c1');

    button(fixture, 'Wyczyść').click();
    fixture.detectChanges();

    expect(component.clientId()).toBe('');
    expect(element(fixture).textContent).toContain(
      'Aby zobaczyć podsumowanie, wybierz klienta oraz miesiąc.'
    );
  });

  it('reads the whole history when from-the-beginning is chosen', async () => {
    const fixture = await render();
    selectClient(fixture, 'c1');

    const checkbox = element(fixture).querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary');
    expect(request.request.params.get('fromTheBeginning')).toBe('true');
    expect(request.request.params.has('fromMonth')).toBe(false);
    request.flush(summary());
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('renders nothing for the derived views until a summary exists', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;

    expect(component.detailRows()).toEqual([]);
    expect(component.totals()).toEqual([]);
    expect(component.reports()).toEqual([]);
  });

  it('does nothing when asked to download the client CSV with no summary', async () => {
    const fixture = await render();
    const download = jest.spyOn(exportService, 'download');

    fixture.componentInstance.downloadClientCsv();

    expect(download).not.toHaveBeenCalled();
  });

  it('renders the chosen extra options and comments when a booking carries them', async () => {
    const fixture = await render();
    selectClient(fixture, 'c1');
    button(fixture, 'Generuj podsumowanie').click();
    fixture.detectChanges();

    httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary').flush({
      client: client(),
      siechnice: [
        {
          generalBookingDetails: {
            payment: 'TRANSFER',
            discount: '10%',
            extraOptions: true,
            selectedOptions: [
              {
                options: [{lights: true}],
                fromHour: new Date('2026-03-01T10:00:00.000Z'),
                toHour: new Date('2026-03-01T11:00:00.000Z'),
              },
            ],
            comments: 'Prosimy o kontakt',
            size: '1/1',
            building: 'kort_1',
          },
          bookingTimeDetails: [
            {
              day: new Date('2026-03-01T10:00:00.000Z'),
              startHours: new Date('2026-03-01T10:00:00.000Z'),
              endHours: new Date('2026-03-01T11:00:00.000Z'),
              status: 'INITIAL',
              comments: 'Uwaga',
            },
          ],
        },
      ],
      radwanice: [],
      'swieta-katarzyna': [],
      'zerniki-wroclawskie': [],
    });
    await Promise.resolve();
    fixture.detectChanges();

    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Wybrane opcje: Światła');
    expect(text).toContain('Prosimy o kontakt');
    expect(text).toContain('KORT#1');
    expect(text).toContain('10%');
  });
});
