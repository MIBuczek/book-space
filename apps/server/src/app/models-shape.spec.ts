import {CLIENT_TYPES, PAYMENTS, IBooking, IPlace} from '@models/booking.model';
import {BOOKING_STATUSES} from '@models/booked-time.model';
import {CITIES, SIZES, IBuilding} from '@models/building.model';
import {IClient} from '@models/client.model';
import {USER_ROLES, IUser} from '@models/user.model';
import {IPaginated} from '@models/pagination.model';

/**
 * The shared lists are the single source of truth for the allowed values, and
 * the DTOs validate against them. These pin each list to `data-model.md`, so a
 * value added here without the specification changing — or removed from the
 * specification — is caught rather than silently accepted by the API.
 *
 * The objects below are also compile-time assertions: if a required field is
 * removed from an interface, the literal stops type-checking and the suite
 * fails to build. The `@ts-expect-error` lines fail in the other direction,
 * because an unused directive is itself an error.
 */
describe('shared model values match data-model.md', () => {
  it('client types', () => {
    expect(CLIENT_TYPES).toEqual(['INDIVIDUAL', 'COMPANY']);
  });

  it('payment methods exclude CARD and include FREE', () => {
    // The business settles payment outside the application and offers
    // Przelew / Gotówka / Bezpłatne; `CARD` was never used.
    expect(PAYMENTS).toEqual(['CASH', 'TRANSFER', 'FREE']);
  });

  it('booking statuses', () => {
    expect(BOOKING_STATUSES).toEqual(['INITIAL', 'DONE', 'CANCELED']);
  });

  it('user roles', () => {
    expect(USER_ROLES).toEqual(['ADMIN', 'OFFICE', 'EMPLOYEE']);
  });

  it('cities', () => {
    expect(CITIES).toEqual([
      'siechnice',
      'radwanice',
      'swieta-katarzyna',
      'zerniki-wroclawskie',
    ]);
  });

  it('sizes', () => {
    expect(SIZES).toEqual(['1/1', '1/2', '1/3', '2/3', '1/4', '3/4']);
  });

  it('a booking carries the fields the data model requires', () => {
    const place: IPlace = {place: 'Sala A', city: 'siechnice'};
    const booking: IBooking = {
      _id: '507f1f77bcf86cd799439011',
      type: 'INDIVIDUAL',
      place,
      size: '1/1',
      nick: 'Rezerwacja Kowalscy',
      personName: 'Anna Kowalska',
      personEmail: 'anna@example.com',
      personPhone: '123456789',
      month: 3,
      bookedTimes: [],
      accepted: false,
      archive: false,
      paymentMethod: 'FREE',
      extraOptions: false,
      selectedOptions: [],
    };

    expect(booking.nick).toBe('Rezerwacja Kowalscy');
    expect(booking.paymentMethod).toBe('FREE');
  });

  it('a client requires a type and a zip code', () => {
    const client: IClient = {
      _id: '507f1f77bcf86cd799439011',
      type: 'COMPANY',
      name: 'Firma sp. z o.o.',
      contactPerson: 'Jan Nowak',
      phone: '123456789',
      email: 'biuro@example.com',
      street: 'ul. Kwiatowa 1',
      city: 'siechnice',
      zipCode: '55-010',
      nip: '1234567890',
    };

    expect(client.type).toBe('COMPANY');
  });

  it('a facility carries the identifiers and options the data model requires', () => {
    const building: IBuilding = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Hala A',
      property: 'siechnice-a',
      city: 'siechnice',
      sizes: ['1/1', '1/2'],
      lighting: true,
      toilets: false,
      email: 'hala@example.com',
      phone: '123456789',
      street: 'ul. Sportowa 2',
      zipCode: '55-010',
      employees: ['507f1f77bcf86cd799439012'],
    };

    expect(building.property).toBe('siechnice-a');
    expect(building.sizes).toContain('1/1');
  });

  it('a user carries a role and an active flag', () => {
    const user: IUser = {
      _id: '507f1f77bcf86cd799439011',
      email: 'office@example.com',
      firstName: 'Anna',
      lastName: 'Kowalska',
      role: 'OFFICE',
      city: 'siechnice',
      buildings: ['siechnice-a'],
      active: true,
    };

    expect(user.role).toBe('OFFICE');
    expect(user.active).toBe(true);
  });

  it('a list response is paginated', () => {
    const page: IPaginated<{_id: string}> = {
      items: [{_id: '507f1f77bcf86cd799439011'}],
      total: 1,
      page: 1,
      limit: 50,
    };

    expect(page.total).toBe(1);
  });

  it('rejects a booking without the required nick', () => {
    const booking = {
      _id: '507f1f77bcf86cd799439011',
      type: 'INDIVIDUAL',
      place: {place: 'Sala A', city: 'siechnice'},
      size: '1/1',
      personName: 'Anna Kowalska',
      personEmail: 'anna@example.com',
      personPhone: '123456789',
      month: 3,
      bookedTimes: [],
      accepted: false,
      archive: false,
      paymentMethod: 'FREE',
      extraOptions: false,
      selectedOptions: [],
    } satisfies Omit<IBooking, 'nick'>;

    // @ts-expect-error `nick` is required on IBooking.
    const missingNick: IBooking = booking;

    expect(missingNick).toBeDefined();
  });
});
