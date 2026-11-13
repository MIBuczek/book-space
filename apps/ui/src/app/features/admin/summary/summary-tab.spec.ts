import {IClient} from '@models/client.model';
import {IBookedTimeSummary, IClientSummary} from '@models/reporting.model';
import {
  CLIENT_DETAIL_FIELDS,
  cityReports,
  cityTotals,
  clientDetailRows,
  csvFilename,
  monthLabel,
  periodLabel,
  periodText,
  rangeError,
  reportEntry,
  reportSlots,
} from './summary-tab';
import type {IReportPeriod} from './summary-tab';
import {testTranslate} from '../../../../testing/i18n-testing';

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

const summaryEntry = (overrides: Partial<IBookedTimeSummary> = {}): IBookedTimeSummary => ({
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
      status: 'INITIAL',
    },
  ],
  ...overrides,
});

const summary = (overrides: Partial<IClientSummary> = {}): IClientSummary => ({
  client: client(),
  siechnice: [],
  radwanice: [],
  'swieta-katarzyna': [],
  'zerniki-wroclawskie': [],
  ...overrides,
});

const period = (overrides: Partial<IReportPeriod> = {}): IReportPeriod => ({
  fromTheBeginning: false,
  fromMonth: new Date('2026-03-01T00:00:00.000Z'),
  toMonth: new Date('2026-05-01T00:00:00.000Z'),
  ...overrides,
});

const t = testTranslate();

describe('periodLabel', () => {
  it('names the month range "from-to.year" from the end month', () => {
    expect(periodLabel(period(), t)).toBe('3-5.2026');
  });

  it('is "od początku" for the from-the-beginning option or a missing bound', () => {
    expect(periodLabel(period({fromTheBeginning: true}), t)).toBe('od początku');
    expect(periodLabel(period({fromMonth: null}), t)).toBe('od początku');
    expect(periodLabel(period({toMonth: null}), t)).toBe('od początku');
  });
});

describe('monthLabel', () => {
  it('reads the month in the facility calendar, not the browser zone', () => {
    // 2026-01-31T23:30Z is 00:30 on 1 February in Warsaw.
    expect(monthLabel(new Date('2026-01-31T23:30:00.000Z'))).toBe('02.2026');
  });
});

describe('periodText', () => {
  it('labels the range with both months', () => {
    expect(periodText(period(), t)).toBe('03.2026 – 05.2026');
  });

  it('collapses to "od początku" when unbounded', () => {
    expect(periodText(period({fromTheBeginning: true}), t)).toBe('od początku');
    expect(periodText(period({toMonth: null}), t)).toBe('od początku');
  });
});

describe('csvFilename', () => {
  it('names a client export after the client and the range', () => {
    expect(csvFilename('Klub Sportowy', period(), false, t)).toBe('klub sportowy (3-5.2026).csv');
  });

  it('names the all-clients export after every client', () => {
    expect(csvFilename(null, period(), true, t)).toBe('wszyscy klienci (3-5.2026).csv');
  });

  it('uses "od początku" for a from-the-beginning export', () => {
    expect(csvFilename('Klub', period({fromTheBeginning: true}), false, t)).toBe(
      'klub (od początku).csv'
    );
  });

  it('falls back to the legacy name when a client export has no client', () => {
    expect(csvFilename(null, period(), false, t)).toBe('Raport clienta.csv');
  });
});

describe('rangeError', () => {
  it('accepts a complete range', () => {
    expect(rangeError(period().fromMonth, period().toMonth, false, t)).toBeNull();
  });

  it('accepts an incomplete range when reading from the beginning', () => {
    expect(rangeError(null, null, true, t)).toBeNull();
  });

  it('refuses an incomplete range', () => {
    expect(rangeError(null, period().toMonth, false, t)).toBe('Wybierz miesiąc początkowy i końcowy.');
    expect(rangeError(period().fromMonth, null, false, t)).toBe(
      'Wybierz miesiąc początkowy i końcowy.'
    );
  });

  it('refuses an inverted range, rather than silently moving the end month', () => {
    expect(
      rangeError(new Date('2026-05-01T00:00:00.000Z'), new Date('2026-03-01T00:00:00.000Z'), false, t)
    ).toBe('Miesiąc początkowy nie może być późniejszy niż końcowy.');
  });
});

describe('clientDetailRows', () => {
  it('lists the legacy fields that carry a value, in the legacy order', () => {
    expect(clientDetailRows(client(), t)).toEqual([
      {label: 'Imię i nazwisko', value: 'Klub Sportowy'},
      {label: 'Typ', value: 'COMPANY'},
      {label: 'Osoba kontaktowa', value: 'Jan Kowalski'},
      {label: 'Telefon', value: '111 222 333'},
      {label: 'E-mail', value: 'klub@example.com'},
      {label: 'Ulica', value: 'ul. Prosta 1'},
      {label: 'Miasto', value: 'Wrocław'},
      {label: 'Kod pocztowy', value: '50-001'},
      {label: 'NIP', value: '1234567890'},
    ]);
  });

  it('drops an empty field rather than rendering it blank', () => {
    const rows = clientDetailRows(client({nip: '', nick: undefined}), t);
    expect(rows.map((row) => row.label)).not.toContain('NIP');
    expect(rows.map((row) => row.label)).not.toContain('Nick');
  });

  it('includes an optional field when it is present', () => {
    const rows = clientDetailRows(client({nick: 'Orzeł'}), t);
    expect(rows.at(-1)).toEqual({label: 'Nick', value: 'Orzeł'});
  });

  it('names every field with a legacy label', () => {
    expect(CLIENT_DETAIL_FIELDS.map((field) => field.key)).toEqual([
      'name',
      'type',
      'contactPerson',
      'phone',
      'email',
      'street',
      'city',
      'zipCode',
      'nip',
      'nick',
    ]);
  });
});

describe('cityTotals', () => {
  it('lists every city in the legacy order with its counter', () => {
    const totals = cityTotals(
      summary({
        siechnice: [summaryEntry()],
        radwanice: [summaryEntry(), summaryEntry()],
      })
    );

    expect(totals.map((total) => [total.city, total.label, total.total])).toEqual([
      ['siechnice', 'Siechnice', '1 rezerwacji, w tym 0 zrealizowanych.'],
      ['radwanice', 'Radwanice', '2 rezerwacji, w tym 0 zrealizowanych.'],
      ['swieta-katarzyna', 'Święta Katarzyna', '0 rezerwacji.'],
      ['zerniki-wroclawskie', 'Żerniki Wrocławskie', '0 rezerwacji.'],
    ]);
  });
});

describe('reportSlots', () => {
  it('formats a slot with its day, hours, participants, status and comments', () => {
    const slots = reportSlots(
      summaryEntry({
        bookingTimeDetails: [
          {
            day: new Date('2026-03-01T10:00:00.000Z'),
            startHours: new Date('2026-03-01T10:00:00.000Z'),
            endHours: new Date('2026-03-01T11:30:00.000Z'),
            status: 'DONE',
            participants: 12,
            comments: 'Uwaga',
          },
        ],
      }),
      t
    );

    expect(slots).toEqual([
      {
        day: '2026-03-01',
        hours: '11:00–12:30',
        participants: '12',
        status: 'Zakończona',
        comments: 'Uwaga',
      },
    ]);
  });

  it('uses "[Brak]" for a missing participant count and comment', () => {
    const [slot] = reportSlots(summaryEntry(), t);
    expect(slot.participants).toBe('[Brak]');
    expect(slot.comments).toBe('[Brak]');
  });

  it('treats an empty comment as missing', () => {
    const [slot] = reportSlots(
      summaryEntry({
        bookingTimeDetails: [
          {
            day: new Date('2026-03-01T10:00:00.000Z'),
            startHours: new Date('2026-03-01T10:00:00.000Z'),
            endHours: new Date('2026-03-01T11:00:00.000Z'),
            status: 'INITIAL',
            comments: '',
          },
        ],
      }),
      t
    );
    expect(slot.comments).toBe('[Brak]');
  });
});

describe('reportEntry', () => {
  it('renders the booking details with the shared vocabulary', () => {
    const entry = reportEntry(summaryEntry(), t);

    expect(entry.building).toBe('Hala sportowa');
    expect(entry.size).toBe('50%');
    expect(entry.discount).toBe('0%');
    expect(entry.payment).toBe('Gotówka');
    expect(entry.extraOptions).toBe('Nie');
    expect(entry.selectedOptions).toBe('');
    expect(entry.comments).toBe('[Brak]');
  });

  it('keeps a granted discount and a comment', () => {
    const entry = reportEntry(
      summaryEntry({
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
      }),
      t
    );

    expect(entry.discount).toBe('10%');
    expect(entry.payment).toBe('Przelew');
    expect(entry.extraOptions).toBe('Tak');
    expect(entry.selectedOptions).toBe('Światła');
    expect(entry.comments).toBe('Prosimy o kontakt');
  });
});

describe('cityReports', () => {
  it('carries the total and the bookings for each city, in the legacy order', () => {
    const reports = cityReports(summary({siechnice: [summaryEntry()]}), t);

    expect(reports.map((report) => report.city)).toEqual([
      'siechnice',
      'radwanice',
      'swieta-katarzyna',
      'zerniki-wroclawskie',
    ]);
    expect(reports[0].total).toBe('1 rezerwacji, w tym 0 zrealizowanych.');
    expect(reports[0].entries).toHaveLength(1);
    expect(reports[1].entries).toEqual([]);
  });
});
