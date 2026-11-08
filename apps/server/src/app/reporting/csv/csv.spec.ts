import {IClient} from '@models/client.model';
import {ISummaryBooking} from '../summary/summary';
import {CSV_COLUMNS} from './csv-columns';
import {clientCsvRows, csvHeader, escapeCell, toCsv} from './csv';

const client = {
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
} as unknown as IClient;

const booking = (overrides: Partial<ISummaryBooking> = {}): ISummaryBooking => ({
  clientId: 'c1',
  accepted: true,
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/2',
  paymentMethod: 'CASH',
  discount: '10%',
  extraOptions: true,
  selectedOptions: [
    {
      options: [{lights: true}],
      fromHour: new Date('2026-03-10T22:00:00Z'),
      toHour: new Date('2026-03-10T23:00:00Z'),
    },
  ],
  comments: 'uwagi',
  bookedTimes: [
    {
      day: new Date('2026-03-10T22:00:00Z'),
      startHours: new Date('2026-03-10T22:00:00Z'),
      endHours: new Date('2026-03-10T23:30:00Z'),
      status: 'DONE',
      participants: 12,
    },
  ],
  ...overrides,
});

const range = {fromTheBeginning: false, from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-31T23:59:59Z')};

describe('clientCsvRows', () => {
  it('emits one row per slot with the client and booking fields merged', () => {
    const rows = clientCsvRows(client, [booking()], range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Klub Sportowy',
      type: 'COMPANY',
      contactPerson: 'Jan Kowalski',
      nip: '1234567890',
      city: 'Wrocław',
      cityBooking: 'Siechnice',
      building: 'Hala sportowa',
      size: '50%',
      payment: 'Gotówka',
      discount: '10%',
      status: 'Zakończona',
      participants: '12',
      extraOptions: 'Tak',
      selectedOptions: 'Światła',
      message: 'uwagi',
    });
  });

  it('formats day and hours in the facility calendar', () => {
    const rows = clientCsvRows(client, [booking()], range);
    // 22:00Z on 2026-03-10 is 23:00 local (CET); the day is still the 10th.
    expect(rows[0].day).toBe('2026-03-10');
    expect(rows[0].startHour).toBe('23:00');
    expect(rows[0].endHour).toBe('00:30');
  });

  it('leaves the option columns empty when no extra option was selected', () => {
    const rows = clientCsvRows(client, [booking({extraOptions: false, selectedOptions: []})], range);
    expect(rows[0].selectedOptions).toBe('');
    expect(rows[0].startHourOption).toBe('');
    expect(rows[0].endHourOption).toBe('');
    expect(rows[0].extraOptions).toBe('Nie');
  });

  it('drops an unaccepted booking and a slot outside the range', () => {
    expect(clientCsvRows(client, [booking({accepted: false})], range)).toEqual([]);

    const outOfRange = booking({
      bookedTimes: [
        {
          day: new Date('2026-06-01T10:00:00Z'),
          startHours: new Date('2026-06-01T10:00:00Z'),
          endHours: new Date('2026-06-01T11:00:00Z'),
          status: 'INITIAL',
        },
      ],
    });
    expect(clientCsvRows(client, [outOfRange], range)).toEqual([]);
  });

  it('emits a row whose keys cover every column, with no undefined cell', () => {
    const rows = clientCsvRows(client, [booking({discount: undefined, comments: undefined, selectedOptions: []})], range);
    for (const column of CSV_COLUMNS) {
      expect(typeof rows[0][column.key]).toBe('string');
    }
  });

  it('renders a missing client field and a missing participant count as empty, not undefined', () => {
    const sparse = {_id: 'c2', name: 'Klub'} as unknown as IClient;
    const rows = clientCsvRows(
      sparse,
      [
        booking({
          bookedTimes: [
            {
              day: new Date('2026-03-10T22:00:00Z'),
              startHours: new Date('2026-03-10T22:00:00Z'),
              endHours: new Date('2026-03-10T23:00:00Z'),
              status: 'INITIAL',
            },
          ],
        }),
      ],
      range
    );
    expect(rows[0].name).toBe('Klub');
    expect(rows[0].type).toBe('');
    expect(rows[0].nip).toBe('');
    expect(rows[0].participants).toBe('');
  });

  it('renders an absent client name as empty rather than undefined', () => {
    // `name` is the column the report is keyed on, and a client created before the field
    // was mandatory can reach the export without one. The `?? ''` keeps the cell a string
    // so the column stays aligned; without it the row would carry `undefined`.
    const nameless = {_id: 'c3'} as unknown as IClient;
    const rows = clientCsvRows(nameless, [booking()], range);

    expect(rows[0].name).toBe('');
  });
});

describe('csvHeader', () => {
  it('is the column labels in order', () => {
    expect(csvHeader()).toEqual(CSV_COLUMNS.map((column) => column.label));
  });
});

describe('escapeCell', () => {
  it('quotes a value containing the separator, a quote or a newline', () => {
    expect(escapeCell('a;b')).toBe('"a;b"');
    expect(escapeCell('a"b')).toBe('"a""b"');
    expect(escapeCell('a\nb')).toBe('"a\nb"');
  });

  it('leaves an ordinary value unquoted', () => {
    expect(escapeCell('Klub Sportowy')).toBe('Klub Sportowy');
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and uses a semicolon separator with CRLF endings', () => {
    const csv = toCsv([{name: 'Klub Sportowy'}]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.map((column) => column.label).join(';'));
    expect(lines[1].split(';')[0]).toBe('Klub Sportowy');
  });

  it('produces a header-only file when there are no rows', () => {
    const csv = toCsv([]);
    expect(csv).toBe(`\uFEFF${CSV_COLUMNS.map((column) => column.label).join(';')}\r\n`);
  });
});
