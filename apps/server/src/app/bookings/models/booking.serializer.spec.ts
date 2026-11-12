import {
  PUBLIC_BOOKING_REDACTIONS,
  serializePublicBooking,
  serializePublicBookings,
} from './booking.serializer';

/** A booking carrying every personal field the redaction list names, plus the rest. */
const fullBooking = () => ({
  _id: 'b1',
  type: 'INDIVIDUAL',
  place: {place: 'Hala', city: 'Siechnice'},
  size: 'X/X',
  clientId: 'c1',
  nick: 'Rezerwacja',
  personName: 'Jan Kowalski',
  personCompany: 'Klub Sportowy',
  personEmail: 'jan@example.com',
  personPhone: '500100200',
  month: 3,
  bookedTimes: [{day: new Date('2026-03-04T00:00:00Z'), status: 'INITIAL'}],
  accepted: true,
  archive: false,
  comments: 'Proszę o kontakt',
  paymentMethod: 'CASH',
  discount: '10%',
  extraOptions: true,
  selectedOptions: [{name: 'Nagłośnienie'}],
  createdBy: 'jan@example.com',
  createdAt: new Date('2026-03-01T00:00:00Z'),
  modifiedBy: 'jan@example.com',
  modifiedAt: new Date('2026-03-02T00:00:00Z'),
});

describe('serializePublicBooking', () => {
  it.each(PUBLIC_BOOKING_REDACTIONS)('removes %s from a public response', (field) => {
    // Asserted per name rather than by count: the list is the policy, and a name
    // that is missing from it is a leak that a length assertion would not catch.
    const result = serializePublicBooking(fullBooking());

    expect(result).not.toHaveProperty(field);
  });

  it('keeps the fields the calendar needs to render', () => {
    const result = serializePublicBooking(fullBooking());

    expect(result).toMatchObject({
      _id: 'b1',
      place: {place: 'Hala', city: 'Siechnice'},
      size: 'X/X',
      month: 3,
      accepted: true,
      archive: false,
      paymentMethod: 'CASH',
    });
    expect(result.bookedTimes).toHaveLength(1);
  });

  it('keeps the calendar label the public visitor sees', () => {
    const result = serializePublicBooking(fullBooking());

    expect(result.nick).toBe('Rezerwacja');
  });

  it('does not remove personCompany', () => {
    // Note 6 names four personal fields plus `clientId` (issue #20); the company is
    // not one of them.
    const result = serializePublicBooking(fullBooking());

    expect(result.personCompany).toBe('Klub Sportowy');
  });

  it('removes the clientId so an anonymous caller cannot correlate bookings to a client', () => {
    const result = serializePublicBooking(fullBooking());

    expect(result).not.toHaveProperty('clientId');
  });

  it('removes the fields even when the booking has no personal data', () => {
    const sparse = {_id: 'b2', personName: undefined, personEmail: undefined};

    const result = serializePublicBooking(sparse);

    expect(Object.keys(result)).toEqual(['_id']);
  });

  it('does not mutate the booking it was given', () => {
    const booking = fullBooking();

    serializePublicBooking(booking);

    expect(booking.personName).toBe('Jan Kowalski');
    expect(booking.personEmail).toBe('jan@example.com');
  });

  it('serialises a document through its own toJSON', () => {
    // Mongoose documents carry their data on internals, so spreading one directly
    // yields the schema's internals rather than the fields. The serialiser has to go
    // through `toJSON`, which is what the driver would have sent.
    const document = {
      toJSON: () => ({_id: 'b3', personName: 'Anna Nowak', personEmail: 'anna@example.com', nick: 'Rezerwacja'}),
      personName: 'should not be read',
    };

    const result = serializePublicBooking(document);

    expect(result).toEqual({_id: 'b3', nick: 'Rezerwacja'});
  });

  it('returns null for a missing booking', () => {
    expect(serializePublicBooking(null)).toBeNull();
    expect(serializePublicBooking(undefined)).toBeNull();
  });
});

describe('serializePublicBookings', () => {
  it('redacts every booking in the list', () => {
    const result = serializePublicBookings([fullBooking(), fullBooking()]);

    expect(result).toHaveLength(2);
    for (const booking of result) {
      expect(booking).not.toHaveProperty('personName');
      expect(booking).not.toHaveProperty('personEmail');
      expect(booking).not.toHaveProperty('personPhone');
      expect(booking).not.toHaveProperty('comments');
    }
  });

  it('returns an empty list for an empty list', () => {
    expect(serializePublicBookings([])).toEqual([]);
  });
});
