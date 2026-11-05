import {IClient} from '@models/client.model';
import {ISummaryBooking, isSummaryCity, slotInRange, summariseClient, summaryTotalBookingsNumber} from './summary';

const client = {
  _id: 'c1',
  type: 'COMPANY',
  name: 'Klub Sportowy',
  contactPerson: 'Jan Kowalski',
  phone: '111',
  email: 'klub@example.com',
  street: 'ul. Prosta 1',
  city: 'Wrocław',
  zipCode: '50-001',
} as unknown as IClient;

const booking = (overrides: Partial<ISummaryBooking> = {}): ISummaryBooking => ({
  clientId: 'c1',
  accepted: true,
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/2',
  paymentMethod: 'CASH',
  discount: '10%',
  extraOptions: false,
  selectedOptions: [],
  comments: 'note',
  bookedTimes: [
    {
      day: new Date('2026-03-10T23:00:00Z'),
      startHours: new Date('2026-03-10T23:00:00Z'),
      endHours: new Date('2026-03-11T00:00:00Z'),
      status: 'INITIAL',
    },
  ],
  ...overrides,
});

describe('slotInRange', () => {
  const range = {fromTheBeginning: false, from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-31T23:59:59Z')};

  it('includes a slot inside the inclusive bounds', () => {
    expect(slotInRange(new Date('2026-03-15T12:00:00Z'), range)).toBe(true);
  });

  it('includes a slot exactly on each bound', () => {
    expect(slotInRange(range.from, range)).toBe(true);
    expect(slotInRange(range.to, range)).toBe(true);
  });

  it('excludes a slot outside the bounds', () => {
    expect(slotInRange(new Date('2026-02-28T23:59:59Z'), range)).toBe(false);
    expect(slotInRange(new Date('2026-04-01T00:00:00Z'), range)).toBe(false);
  });

  it('includes everything when fromTheBeginning is set, ignoring the bounds', () => {
    expect(slotInRange(new Date('2000-01-01T00:00:00Z'), {fromTheBeginning: true})).toBe(true);
  });

  it('excludes everything when a bound is missing, rather than reading the whole history', () => {
    // A partial range is a client error; treating it as open-ended would be the unbounded
    // read FR-043 names, so it fails closed.
    expect(slotInRange(new Date('2026-03-15T12:00:00Z'), {fromTheBeginning: false})).toBe(false);
    expect(slotInRange(new Date('2026-03-15T12:00:00Z'), {fromTheBeginning: false, from: range.from})).toBe(false);
  });
});

describe('summariseClient', () => {
  const range = {fromTheBeginning: false, from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-31T23:59:59Z')};

  it('returns the client with all four cities present and empty', () => {
    const summary = summariseClient(client, [], range);
    expect(summary.client).toBe(client);
    expect(summary.siechnice).toEqual([]);
    expect(summary.radwanice).toEqual([]);
    expect(summary['swieta-katarzyna']).toEqual([]);
    expect(summary['zerniki-wroclawskie']).toEqual([]);
  });

  it('groups an accepted booking under its facility city', () => {
    const summary = summariseClient(client, [booking()], range);
    expect(summary.siechnice).toHaveLength(1);
    expect(summary.siechnice[0].generalBookingDetails).toEqual({
      payment: 'CASH',
      discount: '10%',
      extraOptions: false,
      selectedOptions: [],
      comments: 'note',
      size: '1/2',
      building: 'hala-sportowa',
    });
    expect(summary.siechnice[0].bookingTimeDetails).toHaveLength(1);
    expect(summary.radwanice).toEqual([]);
  });

  it('drops an unaccepted booking', () => {
    const summary = summariseClient(client, [booking({accepted: false})], range);
    expect(summary.siechnice).toEqual([]);
  });

  it('drops a booking whose city is not one of the four', () => {
    const summary = summariseClient(client, [booking({place: {place: 'hala-sportowa', city: 'wroclaw'}})], range);
    expect(summary.siechnice).toEqual([]);
  });

  it('keeps only the slots inside the range, and drops a booking with none left', () => {
    const inRange = booking();
    const outOfRange = booking({
      bookedTimes: [
        {
          day: new Date('2026-05-01T12:00:00Z'),
          startHours: new Date('2026-05-01T12:00:00Z'),
          endHours: new Date('2026-05-01T13:00:00Z'),
          status: 'INITIAL',
        },
      ],
    });

    const summary = summariseClient(client, [inRange, outOfRange], range);
    expect(summary.siechnice).toHaveLength(1);

    const mixed = booking({
      bookedTimes: [
        ...inRange.bookedTimes,
        {
          day: new Date('2026-05-01T12:00:00Z'),
          startHours: new Date('2026-05-01T12:00:00Z'),
          endHours: new Date('2026-05-01T13:00:00Z'),
          status: 'INITIAL',
        },
      ],
    });
    expect(summariseClient(client, [mixed], range).siechnice[0].bookingTimeDetails).toHaveLength(1);
  });

  it('normalises an absent discount to an empty string', () => {
    const summary = summariseClient(client, [booking({discount: undefined})], range);
    expect(summary.siechnice[0].generalBookingDetails.discount).toBe('');
  });

  it('includes a booking with no linked client when it is passed in, since attribution is by client', () => {
    // The service resolves a client by id or by name and passes its accepted bookings; this
    // module only groups them, so a booking carrying no `clientId` still summarises.
    const summary = summariseClient(client, [booking({clientId: undefined})], range);
    expect(summary.siechnice).toHaveLength(1);
  });
});

describe('summaryTotalBookingsNumber', () => {
  const entry = (statuses: Array<'INITIAL' | 'DONE' | 'CANCELED'>) => ({
    generalBookingDetails: {
      payment: 'CASH',
      discount: '',
      extraOptions: false,
      selectedOptions: [],
      size: '1/1',
      building: 'hala-sportowa',
    },
    bookingTimeDetails: statuses.map((status, index) => ({
      day: new Date(`2026-03-0${index + 1}T10:00:00Z`),
      startHours: new Date(`2026-03-0${index + 1}T10:00:00Z`),
      endHours: new Date(`2026-03-0${index + 1}T11:00:00Z`),
      status,
    })),
  });

  it('reports zero bookings when there are none', () => {
    expect(summaryTotalBookingsNumber([])).toBe('0 rezerwacji.');
  });

  it('counts every slot and the done ones separately', () => {
    expect(summaryTotalBookingsNumber([entry(['DONE', 'INITIAL']), entry(['DONE'])])).toBe(
      '3 rezerwacji, w tym 2 zrealizowanych.'
    );
  });
});

describe('isSummaryCity', () => {
  it('accepts the four facility cities', () => {
    expect(isSummaryCity('siechnice')).toBe(true);
    expect(isSummaryCity('zerniki-wroclawskie')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSummaryCity('wroclaw')).toBe(false);
    expect(isSummaryCity('')).toBe(false);
  });
});
