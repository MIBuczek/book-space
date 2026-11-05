import {bookingEmail, bookingVariables, flatBookingTime, joinSlots} from './booking-email';

const booking = {
  _id: 'b1',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  personName: 'Jan Kowalski',
  personCompany: 'Klub Sportowy',
  personEmail: 'jan@example.com',
  personPhone: '500100200',
  paymentMethod: 'TRANSFER',
  comments: 'Proszę o kontakt',
  bookedTimes: [
    {
      day: new Date('2026-03-04T10:00:00Z'),
      startHours: new Date('2026-03-04T10:00:00Z'),
      endHours: new Date('2026-03-04T11:00:00Z'),
      status: 'INITIAL' as const,
    },
    {
      day: new Date('2026-03-05T10:00:00Z'),
      startHours: new Date('2026-03-05T10:00:00Z'),
      endHours: new Date('2026-03-05T11:00:00Z'),
      status: 'INITIAL' as const,
    },
  ],
};

describe('flatBookingTime', () => {
  it('renders the day and both hours in the facility calendar on one line', () => {
    const line = flatBookingTime(booking.bookedTimes[0]);
    expect(line).not.toContain('\n');
    // 10:00Z in March is 11:00 local (CET).
    expect(line).toContain('2026-03-04');
    expect(line).toContain('11:00');
    expect(line).toContain('12:00');
  });
});

describe('joinSlots', () => {
  it('joins the slots with the separator it is given', () => {
    expect(joinSlots(booking.bookedTimes, '\n').split('\n')).toHaveLength(2);
    expect(joinSlots(booking.bookedTimes, ' / ').split(' / ')).toHaveLength(2);
  });
});

describe('bookingVariables', () => {
  it('maps the legacy field set, including the Polish display values', () => {
    const variables = bookingVariables(booking, 'facility@example.com');
    expect(variables.building).toBe('Hala sportowa');
    expect(variables.city).toBe('Siechnice');
    expect(variables.payment).toBe('Przelew');
    expect(variables.person).toBe('Jan Kowalski');
    expect(variables.club).toBe('Klub Sportowy');
    expect(variables.email).toBe('jan@example.com');
    expect(variables.phone).toBe('500100200');
    expect(variables.message).toBe('Proszę o kontakt');
    expect(variables.buildingEmail).toBe('facility@example.com');
  });

  it('omits buildingEmail when it is not supplied, and joins slots with " / "', () => {
    const variables = bookingVariables(booking);
    expect(variables.buildingEmail).toBeUndefined();
    expect(String(variables.parsedBookingTime)).toContain(' / ');
    expect(String(variables.parsedBookingTime)).not.toContain('\n');
  });
});

describe('bookingEmail', () => {
  it('renders the facility variant with the facility address and newline-joined slots', () => {
    const {subject, text} = bookingEmail(booking, 'booking-facility', 'facility@example.com');
    expect(subject).toBe('Nowa rezerwacja: Hala sportowa (Siechnice)');
    expect(text).toContain('Jan Kowalski');
    expect(text).toContain('Klub Sportowy');
    expect(text).toContain('jan@example.com');
    expect(text).toContain('Przelew');
    expect(text).toContain('Proszę o kontakt');
    expect(text).toContain('E-mail obiektu: facility@example.com');
    expect(text.split('Rezerwacja na dzień').length - 1).toBe(2);
    expect(text).not.toContain('{{');
  });

  it('renders the staff variant without the facility address and with " / "-joined slots', () => {
    const {subject, text} = bookingEmail(booking, 'booking-staff');
    expect(subject).toBe('Nowa prośba o rezerwację: Hala sportowa (Siechnice)');
    expect(text).not.toContain('E-mail obiektu');
    expect(text).toContain(' / ');
    expect(text).not.toContain('{{');
  });

  it('leaves no unresolved placeholder for a booking that omits the optional fields', () => {
    const minimal = {...booking, personCompany: undefined, comments: undefined};
    for (const id of ['booking-facility', 'booking-staff'] as const) {
      const {subject, text} = bookingEmail(minimal, id, 'facility@example.com');
      expect(subject).not.toContain('{{');
      expect(text).not.toContain('{{');
      expect(text).not.toContain('Firma:');
      expect(text).not.toContain('Wiadomość:');
    }
  });
});
