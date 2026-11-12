import {instantFromLegacyLocal} from '@booking/date-time';
import {
  monthFromSlots,
  toClientType,
  toParticipants,
  toPayment,
  toPlace,
  toRole,
  toStatus,
  transformBookedTime,
  transformBooking,
  transformBuilding,
  transformClient,
  transformUser,
} from './transforms';
import {ILegacyBooking, ILegacyUser} from './legacy';
import {DEFAULT_CREATED_BY, DEFAULT_DISCOUNT, DEFAULT_MODIFIED_BY, DEFAULT_NICK} from './defaults';
import {objectIdFromLegacyId} from './identity';
import {legacyExport} from '../testing/fixtures';

/**
 * One assertion per documented transformation (T042).
 *
 * The transforms are the whole point of the migration, so each rule research.md R10 and
 * spec.md §5 name gets its own case. A test that asserted the whole transformed object at once
 * would pass while one field was wrong, which is the failure this file exists to prevent.
 */

const bookingById = (id: string): ILegacyBooking => {
  const booking = legacyExport.bookings.find((candidate) => candidate._id === id);
  if (!booking) {
    throw new Error(`Fixture booking ${id} is missing`);
  }
  return booking;
};

/** The first slot of a fixture booking; throws rather than asserting so a missing fixture is a clear failure. */
const slotOf = (id: string, index: number) => {
  const slots = bookingById(id).bookingTime ?? [];
  const slot = slots[index];
  if (!slot) {
    throw new Error(`Fixture booking ${id} has no slot ${index}`);
  }
  return slot;
};

describe('migration transforms', () => {
  describe('identity', () => {
    it('derives a stable ObjectId from the legacy id, so a re-run writes the same _id', () => {
      const first = objectIdFromLegacyId('booking-complete');
      const second = objectIdFromLegacyId('booking-complete');
      expect(first.toHexString()).toBe(second.toHexString());
      expect(first.toHexString()).toMatch(/^[0-9a-f]{24}$/);
    });

    it('derives a different _id for a different legacy id', () => {
      expect(objectIdFromLegacyId('a').toHexString()).not.toBe(objectIdFromLegacyId('b').toHexString());
    });
  });

  describe('client type', () => {
    it('maps the legacy Polish labels onto the target enum', () => {
      expect(toClientType('Indywidualny')).toBe('INDIVIDUAL');
      expect(toClientType('Firma')).toBe('COMPANY');
    });

    it('keeps an already-upper-case target value, so a partial export is not re-mapped', () => {
      expect(toClientType('COMPANY')).toBe('COMPANY');
      expect(toClientType('INDIVIDUAL')).toBe('INDIVIDUAL');
    });

    it('treats an unrecognised or absent type as an individual rather than dropping the record', () => {
      expect(toClientType(undefined)).toBe('INDIVIDUAL');
      expect(toClientType('cokolwiek')).toBe('INDIVIDUAL');
    });
  });

  describe('payment', () => {
    it('maps the legacy lower-case values onto the target enum', () => {
      expect(toPayment('cash')).toBe('CASH');
      expect(toPayment('transfer')).toBe('TRANSFER');
      expect(toPayment('free')).toBe('FREE');
    });

    it('maps the legacy-only `invoice` value to `transfer`, as the legacy read mapper did', () => {
      expect(toPayment('invoice')).toBe('TRANSFER');
    });

    it('defaults an absent or unrecognised payment to transfer rather than dropping the booking', () => {
      expect(toPayment(undefined)).toBe('TRANSFER');
      expect(toPayment('nieznana')).toBe('TRANSFER');
    });
  });

  describe('slot status', () => {
    it('maps `QUIT` to `CANCELED` and keeps the other two', () => {
      expect(toStatus('QUIT')).toBe('CANCELED');
      expect(toStatus('INITIAL')).toBe('INITIAL');
      expect(toStatus('DONE')).toBe('DONE');
    });

    it('treats an absent status as INITIAL', () => {
      expect(toStatus(undefined)).toBe('INITIAL');
    });
  });

  describe('participants', () => {
    it('coerces the legacy string to a number', () => {
      expect(toParticipants('12')).toBe(12);
      expect(toParticipants(7)).toBe(7);
    });

    it('leaves an empty or non-numeric value undefined rather than storing NaN', () => {
      expect(toParticipants('')).toBeUndefined();
      expect(toParticipants(undefined)).toBeUndefined();
      expect(toParticipants('brak')).toBeUndefined();
    });
  });

  describe('place', () => {
    it('carries the city and facility key through, including the underscore spellings', () => {
      expect(toPlace('siechnice', 'hala-sportowa')).toEqual({city: 'siechnice', place: 'hala-sportowa'});
      expect(toPlace('radwanice', 'kort_1')).toEqual({city: 'radwanice', place: 'kort_1'});
    });

    it('substitutes empty strings for an absent city or facility', () => {
      expect(toPlace(undefined, undefined)).toEqual({city: '', place: ''});
    });
  });

  describe('role', () => {
    it('maps a single legacy flag onto the target role', () => {
      expect(toRole({_id: 'u', isAdmin: true} as ILegacyUser)).toBe('ADMIN');
      expect(toRole({_id: 'u', isOffice: true} as ILegacyUser)).toBe('OFFICE');
      expect(toRole({_id: 'u', isEmployee: true} as ILegacyUser)).toBe('EMPLOYEE');
    });

    it('resolves a multi-flag document to the most privileged role, matching the legacy precedence', () => {
      expect(toRole({_id: 'u', isAdmin: true, isOffice: true, isEmployee: true} as ILegacyUser)).toBe('ADMIN');
      expect(toRole({_id: 'u', isOffice: true, isEmployee: true} as ILegacyUser)).toBe('OFFICE');
    });

    it('treats a document with no flag as the least-privileged role', () => {
      expect(toRole({_id: 'u'} as ILegacyUser)).toBe('EMPLOYEE');
    });
  });

  describe('slot time (R4/T055)', () => {
    it('reinterprets every legacy local value as a Europe/Warsaw wall clock', () => {
      const slot = transformBookedTime(slotOf('booking-complete', 0));
      expect(slot.startHours.toISOString()).toBe(instantFromLegacyLocal('2026-03-29T08:00').toISOString());
      expect(slot.endHours.toISOString()).toBe(instantFromLegacyLocal('2026-03-29T10:00').toISOString());
    });

    it('normalises `day` to local midnight, discarding the legacy T00:01 anchor', () => {
      const slot = transformBookedTime(slotOf('booking-complete', 0));
      // 2026-03-29 00:00 local is 2026-03-28T23:00Z: the day before the spring-forward at 02:00.
      expect(slot.day.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    });

    it('maps a slot on the fall-back day at the correct offset, which a fixed +1/+2 would miss', () => {
      const slot = transformBookedTime(slotOf('booking-complete', 1));
      expect(slot.startHours.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    });

    it('carries the status, participants and comments across', () => {
      const slot = transformBookedTime(slotOf('booking-complete', 0));
      expect(slot).toMatchObject({status: 'DONE', participants: 12, comments: 'Rano'});
    });
  });

  describe('booking', () => {
    it('maps every documented field of a complete booking', () => {
      const booking = transformBooking(bookingById('booking-complete'));
      expect(booking).toMatchObject({
        _id: objectIdFromLegacyId('booking-complete'),
        type: 'COMPANY',
        place: {city: 'siechnice', place: 'hala-sportowa'},
        size: '1/1',
        nick: 'Przykładowa',
        personName: 'Jan Kowalski',
        personCompany: 'Przykładowa Sp. z o.o.',
        personEmail: 'biuro@example.com',
        personPhone: '600 100 200',
        comments: 'Turniej',
        paymentMethod: 'TRANSFER',
        discount: '10%',
        accepted: true,
        archive: false,
        createdBy: 'office@example.com',
        modifiedBy: 'admin@example.com',
      });
      expect(booking.createdAt?.toISOString()).toBe('2025-11-02T10:00:00.000Z');
      expect(booking.modifiedAt?.toISOString()).toBe('2025-11-03T11:00:00.000Z');
    });

    it('rewrites clientId to the client _id derived from the same legacy id, so the reference survives', () => {
      const booking = transformBooking(bookingById('booking-complete'));
      expect(booking.clientId).toBe(objectIdFromLegacyId('client-company').toHexString());
    });

    it('derives extraOptions from selectedOptions rather than reading the legacy flag', () => {
      expect(transformBooking(bookingById('booking-complete')).extraOptions).toBe(true);
      expect(transformBooking(bookingById('booking-minimal')).extraOptions).toBe(false);
    });

    it('transforms the selected options’ hour fields as instants too', () => {
      const booking = transformBooking(bookingById('booking-complete'));
      expect(booking.selectedOptions).toHaveLength(1);
      expect(booking.selectedOptions[0].fromHour.toISOString()).toBe(
        instantFromLegacyLocal('2026-03-29T07:00').toISOString()
      );
    });

    it('supplies the documented defaults for a record missing the newer fields', () => {
      const booking = transformBooking(bookingById('booking-minimal'));
      expect(booking.nick).toBe(DEFAULT_NICK);
      expect(booking.discount).toBe(DEFAULT_DISCOUNT);
      expect(booking.createdBy).toBe(DEFAULT_CREATED_BY);
      expect(booking.modifiedBy).toBe(DEFAULT_MODIFIED_BY);
      expect(booking.createdAt).toBeUndefined();
      expect(booking.modifiedAt).toBeUndefined();
      // The legacy record has no `type`, so the transform reads it as an individual.
      expect(booking.type).toBe('INDIVIDUAL');
      expect(booking.clientId).toBeUndefined();
    });

    it('reads an absent contact field as an empty string, which the schema then rejects', () => {
      const booking = transformBooking({_id: 'b', city: 'siechnice', building: 'hala-sportowa', size: '1/1'});
      expect(booking.personName).toBe('');
      expect(booking.personEmail).toBe('');
      expect(booking.personPhone).toBe('');
    });

    it('reads an absent size as an empty string rather than leaving it undefined', () => {
      const booking = transformBooking({_id: 'b', city: 'siechnice', building: 'hala-sportowa'});
      expect(booking.size).toBe('');
    });

    it('records rodoAcknowledgement as false, the honest value for a consent the legacy app never stored', () => {
      expect(transformBooking(bookingById('booking-complete')).rodoAcknowledgement).toBe(false);
    });

    it('recomputes month from the first slot, so the hint and the slots cannot disagree', () => {
      // June is month index 5.
      expect(transformBooking(bookingById('booking-minimal')).month).toBe(5);
    });
  });

  describe('monthFromSlots', () => {
    it('is zero for a booking with no slots rather than reading undefined', () => {
      expect(monthFromSlots([])).toBe(0);
    });
  });

  describe('client', () => {
    it('maps a company client, keeping the NIP', () => {
      const client = transformClient(legacyExport.clients[0]);
      expect(client).toMatchObject({
        _id: objectIdFromLegacyId('client-company'),
        type: 'COMPANY',
        name: 'Przykładowa Sp. z o.o.',
        nick: 'Przykładowa',
        contactPerson: 'Jan Kowalski',
        nip: '8991234567',
      });
    });

    it('leaves nick and nip undefined for an individual with neither', () => {
      const client = transformClient(legacyExport.clients[1]);
      expect(client.type).toBe('INDIVIDUAL');
      expect(client.nick).toBeUndefined();
      expect(client.nip).toBeUndefined();
    });

    it('reads every absent scalar as an empty string rather than leaving it undefined', () => {
      const client = transformClient({_id: 'c'});
      expect(client).toMatchObject({name: '', contactPerson: '', phone: '', email: '', street: '', city: '', zipCode: ''});
    });

    it('leaves a whitespace-only nick and nip undefined, so the schema sees them as absent', () => {
      const client = transformClient({_id: 'c', nick: '   ', nip: '  '});
      expect(client.nick).toBeUndefined();
      expect(client.nip).toBeUndefined();
    });
  });

  describe('building', () => {
    it('renames `size` to `sizes` and promotes `extra` to top-level booleans', () => {
      const building = transformBuilding(legacyExport.buildings[0]);
      expect(building).toMatchObject({
        _id: objectIdFromLegacyId('building-hala-siechnice'),
        name: 'Hala Sportowa',
        property: 'hala-sportowa',
        city: 'siechnice',
        sizes: ['1/1', '1/2'],
        lighting: true,
        toilets: true,
        employees: ['Anna Nowak', 'Piotr Zieliński'],
      });
    });

    it('defaults the extra flags to false when `extra` is absent', () => {
      const building = transformBuilding({_id: 'b', name: 'X', city: 'siechnice', property: 'p'});
      expect(building.lighting).toBe(false);
      expect(building.toilets).toBe(false);
      expect(building.sizes).toEqual([]);
      expect(building.employees).toEqual([]);
    });

    it('reads an absent name, property and city as empty strings', () => {
      const building = transformBuilding({_id: 'b'});
      expect(building).toMatchObject({name: '', property: '', city: ''});
    });
  });

  describe('user', () => {
    it('splits the single legacy name into firstName and lastName', () => {
      const user = transformUser(legacyExport.users[0]);
      expect(user.firstName).toBe('Michał');
      expect(user.lastName).toBe('Hoffman');
    });

    it('lower-cases the e-mail, matching the target schema', () => {
      expect(transformUser(legacyExport.users[0]).email).toBe('admin@example.com');
    });

    it('maps the role flag and renames `building` to `buildings`', () => {
      const user = transformUser(legacyExport.users[1]);
      expect(user.role).toBe('OFFICE');
      expect(user.buildings).toEqual(['hala-sportowa']);
      expect(user.city).toBe('siechnice');
    });

    it('gives a placeholder surname to a single-token name, which the schema requires', () => {
      const user = transformUser(legacyExport.users[2]);
      expect(user.firstName).toBe('Tomasz');
      expect(user.lastName).toBe('Unknown');
    });

    it('does not include a password, which the runner adds at write time', () => {
      expect(transformUser(legacyExport.users[0])).not.toHaveProperty('password');
    });

    it('substitutes placeholders for an entirely empty name', () => {
      const user = transformUser({_id: 'u', email: 'x@y.z'});
      expect(user.firstName).toBe('Unknown');
      expect(user.lastName).toBe('Unknown');
      expect(user.city).toBeUndefined();
      expect(user.buildings).toEqual([]);
    });

    it('reads an absent e-mail as an empty string and a blank city as absent', () => {
      const user = transformUser({_id: 'u', name: 'Jan Kowalski', city: '   '});
      expect(user.email).toBe('');
      expect(user.city).toBeUndefined();
    });
  });
});
