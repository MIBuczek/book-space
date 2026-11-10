import {IBooking} from '@models/booking.model';
import {IBookedTime} from '@models/booked-time.model';
import {
  DEFAULT_LABEL,
  EVENT_COLORS,
  bookingToEvents,
  bookingsToEvents,
  dayColumn,
  endOfFacilityDay,
  eventColor,
  eventLabel,
  eventsOnDay,
  gridHours,
  isCancelled,
  monthDays,
  monthLabel,
  periodFor,
  shiftAnchor,
  startOfFacilityWeek,
  statusLabel,
  weekColumns,
  weekDays,
} from './calendar-events';

/** A booking with one slot per status, so the hide/label/colour rules can be asserted together. */
const slot = (overrides: Partial<IBookedTime> = {}): IBookedTime => ({
  day: new Date('2026-03-04T00:00:00Z'),
  startHours: new Date('2026-03-04T10:00:00Z'),
  endHours: new Date('2026-03-04T11:00:00Z'),
  status: 'INITIAL',
  ...overrides,
});

const booking = (overrides: Partial<IBooking> = {}): IBooking => ({
  _id: 'b1',
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Rezerwacja Kowalscy',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '500100200',
  month: 2,
  bookedTimes: [slot()],
  accepted: true,
  archive: false,
  paymentMethod: 'CASH',
  extraOptions: false,
  selectedOptions: [],
  ...overrides,
});

describe('eventColor', () => {
  it('colours a completed slot dark grey', () => {
    expect(eventColor(true, 'DONE')).toBe(EVENT_COLORS.done);
  });

  it('colours an accepted slot green, even when it also completed', () => {
    // DONE wins over accepted — the legacy precedence.
    expect(eventColor(true, 'DONE')).toBe(EVENT_COLORS.done);
    expect(eventColor(true, 'INITIAL')).toBe(EVENT_COLORS.accepted);
  });

  it('colours an unaccepted slot blue', () => {
    expect(eventColor(false, 'INITIAL')).toBe(EVENT_COLORS.pending);
  });
});

describe('isCancelled', () => {
  it('hides a cancelled slot', () => {
    expect(isCancelled('CANCELED')).toBe(true);
  });

  it('keeps initial and done slots', () => {
    expect(isCancelled('INITIAL')).toBe(false);
    expect(isCancelled('DONE')).toBe(false);
  });
});

describe('eventLabel', () => {
  it('shows the nickname to the public', () => {
    expect(eventLabel(booking(), false)).toBe('Rezerwacja Kowalscy');
  });

  it('falls back to "Rezerwacja" when a public booking carries no nickname', () => {
    expect(eventLabel(booking({nick: ''}), false)).toBe(DEFAULT_LABEL);
  });

  it('shows the tenant name to staff', () => {
    expect(eventLabel(booking(), true)).toBe('Jan Kowalski');
  });

  it('falls back to "Rezerwacja" when a staff booking carries no tenant name', () => {
    expect(eventLabel(booking({personName: ''}), true)).toBe(DEFAULT_LABEL);
  });
});

describe('bookingToEvents', () => {
  it('builds one event per non-cancelled slot', () => {
    const events = bookingToEvents(
      booking({bookedTimes: [slot(), slot({status: 'DONE'}), slot({status: 'CANCELED'})]}),
      false
    );

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.slotIndex)).toEqual([0, 1]);
  });

  it('carries the day, hours and size of the slot', () => {
    const [event] = bookingToEvents(booking(), false);

    expect(event).toMatchObject({
      bookingId: 'b1',
      title: 'Rezerwacja Kowalscy',
      day: '2026-03-04',
      start: '11:00',
      end: '12:00',
      size: '1/1',
    });
  });

  it('gives each slot a unique id', () => {
    const events = bookingToEvents(booking({bookedTimes: [slot(), slot()]}), false);

    expect(events[0].id).not.toBe(events[1].id);
  });

  it('returns nothing for a booking with no slots', () => {
    expect(bookingToEvents(booking({bookedTimes: []}), false)).toEqual([]);
  });
});

describe('bookingsToEvents', () => {
  it('flattens every booking into its events', () => {
    const events = bookingsToEvents(
      [booking({_id: 'a'}), booking({_id: 'b', bookedTimes: [slot(), slot()]})],
      false
    );

    expect(events).toHaveLength(3);
  });

  /**
   * The calendar's client-side half of NFR-009 (T050, issue #54).
   *
   * The server-side load is timed in `apps/server/src/app/performance.integration.spec.ts`;
   * this is the other half of "the calendar renders within 2 s" — turning the loaded bookings
   * into events. It is a pure function over a year of bookings, so the measurement is the
   * transform rather than a jsdom render, which would be measuring the test environment. The
   * bound is the specification's own 2 s target and the data set is a year; on this machine the
   * transform runs in single-digit milliseconds, so a failure means the flattening gained a
   * quadratic path, not that the runner was slow. The number is printed so it is recorded.
   */
  it('turns a year of bookings into events well under 2 s (NFR-009)', () => {
    const yearStart = new Date('2026-01-01T00:00:00Z').getTime();
    const hourStep = (365 * 24 * 3_600_000) / 1200;
    const year: IBooking[] = Array.from({length: 1200}, (_, index) =>
      booking({_id: `b${index}`, bookedTimes: [slot({day: new Date(yearStart + index * hourStep)})]})
    );

    const started = performance.now();
    const events = bookingsToEvents(year, true);
    const ms = performance.now() - started;

    // eslint-disable-next-line no-console
    console.log(`[T050] calendar transform, year of bookings: ${ms.toFixed(1)} ms`);
    expect(events).toHaveLength(1200);
    expect(ms).toBeLessThan(2000);
  });
});

describe('weekDays', () => {
  it('returns the seven days of the week, Monday first', () => {
    // 2026-03-04 is a Wednesday; the week starts Monday 2026-03-02.
    expect(weekDays(new Date('2026-03-04T12:00:00Z'))).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  it('anchors on Monday when given a Monday', () => {
    expect(weekDays(new Date('2026-03-02T12:00:00Z'))[0]).toBe('2026-03-02');
  });

  it('anchors on the previous Monday when given a Sunday', () => {
    expect(weekDays(new Date('2026-03-08T12:00:00Z'))[0]).toBe('2026-03-02');
  });
});

describe('statusLabel', () => {
  it('labels a completed slot', () => {
    expect(statusLabel(true, 'DONE')).toBe('Zakończona');
  });

  it('labels an accepted, unfinished slot', () => {
    expect(statusLabel(true, 'INITIAL')).toBe('Zatwierdzona');
  });

  it('labels an unaccepted slot', () => {
    expect(statusLabel(false, 'INITIAL')).toBe('Oczekująca');
  });
});

describe('gridHours', () => {
  it('runs from 06:00 to 23:00', () => {
    expect(gridHours()).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe('eventsOnDay', () => {
  it('keeps only that day, sorted by start hour', () => {
    const early = bookingToEvents(booking({_id: 'a'}), false)[0];
    const late = bookingToEvents(
      booking({_id: 'b', bookedTimes: [slot({startHours: new Date('2026-03-04T14:00:00Z'), endHours: new Date('2026-03-04T15:00:00Z')})]}),
      false
    )[0];
    const otherDay = bookingToEvents(
      booking({_id: 'c', bookedTimes: [slot({day: new Date('2026-03-05T00:00:00Z')})]}),
      false
    )[0];

    const result = eventsOnDay([late, early, otherDay], '2026-03-04');
    expect(result.map((event) => event.bookingId)).toEqual(['a', 'b']);
  });
});

describe('weekColumns', () => {
  it('pairs each day with its Polish weekday label', () => {
    const columns = weekColumns(new Date('2026-03-04T12:00:00Z'));
    expect(columns[0]).toEqual({day: '2026-03-02', label: 'pon'});
    expect(columns[6]).toEqual({day: '2026-03-08', label: 'nie'});
  });
});

describe('dayColumn', () => {
  it('labels the anchor day with its weekday', () => {
    // 2026-03-04 is a Wednesday.
    expect(dayColumn(new Date('2026-03-04T12:00:00Z'))).toEqual({day: '2026-03-04', label: 'śr'});
  });
});

describe('monthDays', () => {
  it('lists every facility-local day of the month', () => {
    const days = monthDays(new Date('2026-03-15T12:00:00Z'));
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-03-01');
    expect(days[30]).toBe('2026-03-31');
  });

  it('handles February in a non-leap year', () => {
    expect(monthDays(new Date('2026-02-15T12:00:00Z'))).toHaveLength(28);
  });
});

describe('monthLabel', () => {
  it('names the month and year in Polish', () => {
    expect(monthLabel(new Date('2026-03-15T12:00:00Z'))).toBe('marzec 2026');
  });

  it('handles the year boundary', () => {
    expect(monthLabel(new Date('2026-01-15T12:00:00Z'))).toBe('styczeń 2026');
    expect(monthLabel(new Date('2026-12-15T12:00:00Z'))).toBe('grudzień 2026');
  });
});

describe('endOfFacilityDay', () => {
  it('is the last millisecond of the facility-local day', () => {
    expect(endOfFacilityDay(new Date('2026-03-10T12:00:00Z')).toISOString()).toBe(
      '2026-03-10T22:59:59.999Z'
    );
  });
});

describe('periodFor', () => {
  const anchor = new Date('2026-03-10T12:00:00Z');

  it('loads the whole calendar week for the week and list views', () => {
    expect(periodFor('week', anchor).from.toISOString()).toBe('2026-03-08T23:00:00.000Z');
    expect(periodFor('list', anchor).to.toISOString()).toBe('2026-03-15T22:59:59.999Z');
  });

  it('loads one facility-local day for the day view', () => {
    expect(periodFor('day', anchor).from.toISOString()).toBe('2026-03-09T23:00:00.000Z');
    expect(periodFor('day', anchor).to.toISOString()).toBe('2026-03-10T22:59:59.999Z');
  });

  it('loads the facility-local month for the month view', () => {
    expect(periodFor('month', anchor).from.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(periodFor('month', anchor).to.toISOString()).toBe('2026-03-31T21:59:59.000Z');
  });
});

describe('shiftAnchor', () => {
  const anchor = new Date('2026-03-10T12:00:00Z');

  it('steps one day for the day view', () => {
    expect(shiftAnchor('day', anchor, 1).toISOString()).toBe('2026-03-11T12:00:00.000Z');
  });

  it('steps one week for the week and list views', () => {
    expect(shiftAnchor('week', anchor, -1).toISOString()).toBe('2026-03-03T12:00:00.000Z');
  });

  it('steps one month for the month view, across a year boundary', () => {
    expect(shiftAnchor('month', new Date('2026-12-15T12:00:00Z'), 1).toISOString()).toBe(
      '2027-01-01T12:00:00.000Z'
    );
    expect(shiftAnchor('month', new Date('2026-01-15T12:00:00Z'), -1).toISOString()).toBe(
      '2025-12-01T12:00:00.000Z'
    );
  });
});

describe('startOfFacilityWeek', () => {
  it('is the Monday of the week', () => {
    expect(startOfFacilityWeek(new Date('2026-03-04T12:00:00Z')).toISOString()).toBe(
      '2026-03-01T23:00:00.000Z'
    );
  });
});
