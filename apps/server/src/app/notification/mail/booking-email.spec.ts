import {bookingEmailBody, bookingSubject, slotLines} from './booking-email';

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

describe('slotLines', () => {
  it('renders one line per slot with the day and both hours in the facility calendar', () => {
    const lines = slotLines(booking.bookedTimes).split('\n');
    expect(lines).toHaveLength(2);
    // 10:00Z in March is 11:00 local (CET).
    expect(lines[0]).toContain('2026-03-04');
    expect(lines[0]).toContain('11:00');
    expect(lines[0]).toContain('12:00');
    expect(lines[1]).toContain('2026-03-05');
  });
});

describe('bookingSubject', () => {
  it('names the facility and city', () => {
    expect(bookingSubject(booking, true)).toContain('hala-sportowa');
    expect(bookingSubject(booking, true)).toContain('siechnice');
  });

  it('distinguishes a facility notification from a staff one', () => {
    expect(bookingSubject(booking, true)).not.toBe(bookingSubject(booking, false));
  });
});

describe('bookingEmailBody', () => {
  it('carries the booking facts and every slot', () => {
    const body = bookingEmailBody(booking);
    expect(body).toContain('Jan Kowalski');
    expect(body).toContain('Klub Sportowy');
    expect(body).toContain('jan@example.com');
    expect(body).toContain('TRANSFER');
    expect(body).toContain('Proszę o kontakt');
    expect(body.split('Rezerwacja na dzień').length - 1).toBe(2);
  });

  it('omits the company and message lines when they are absent', () => {
    const body = bookingEmailBody({...booking, personCompany: undefined, comments: undefined});
    expect(body).not.toContain('Firma:');
    expect(body).not.toContain('Wiadomość:');
  });
});
