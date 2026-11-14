import {displayValue} from '@booking/reporting';
import {IBooking} from '@models/booking.model';
import {IBookedTime} from '@models/booked-time.model';
import {
  END_HOURS,
  END_OF_DAY_HOUR,
  FROM_THE_BEGINNING,
  OPENING_HOUR,
  PAGE_SIZES,
  START_HOURS,
  STATUS_LABELS,
  buildSlot,
  conflictLabel,
  hasConflict,
  isResolved,
  periodOptions,
  replaceSlot,
  resolvePeriod,
  slotLabel,
  slotsLabel,
  toRow,
  toSlotRows,
} from './bookings-table';
import {testTranslate} from '../../../../testing/i18n-testing';

const slot = (overrides: Partial<IBookedTime> = {}): IBookedTime => ({
  day: new Date('2026-08-03T22:00:00.000Z'),
  startHours: new Date('2026-08-03T23:00:00.000Z'),
  endHours: new Date('2026-08-04T00:00:00.000Z'),
  status: 'INITIAL',
  ...overrides,
});

const booking = (overrides: Partial<IBooking> = {}): IBooking => ({
  _id: 'b1',
  type: 'INDIVIDUAL',
  place: {place: 'hala', city: 'siechnice'},
  size: '1/1',
  nick: 'Klub',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '123456789',
  month: 7,
  bookedTimes: [slot()],
  accepted: false,
  archive: false,
  extraOptions: false,
  selectedOptions: [],
  paymentMethod: 'CASH',
  ...overrides,
});

const t = testTranslate();

describe('periodOptions', () => {
  it('lists "from the beginning" first, then the academic years newest first', () => {
    const options = periodOptions(new Date('2026-09-15T12:00:00+02:00'), t, 2024);

    expect(options.map((option) => option.label)).toEqual([
      'Od początku',
      '2026/2027',
      '2025/2026',
      '2024/2025',
    ]);
  });

  it('uses the corrected academic-year start, not the legacy month-late one', () => {
    // August belongs to the year that begins that August; the legacy test switched in
    // September, so it omitted the year that had just started.
    const options = periodOptions(new Date('2026-08-15T12:00:00+02:00'), t, 2024);

    expect(options[1].label).toBe('2026/2027');
  });

  it('gives the first option the from-the-beginning value and a null start year', () => {
    const [first] = periodOptions(new Date('2026-09-15T12:00:00+02:00'), t, 2026);

    expect(first.value).toBe(FROM_THE_BEGINNING);
    expect(first.startYear).toBeNull();
  });
});

describe('resolvePeriod', () => {
  const options = periodOptions(new Date('2026-09-15T12:00:00+02:00'), t, 2024);
  const now = new Date('2026-09-15T12:00:00+02:00');

  it('resolves an academic year to its facility-local bounds', () => {
    const resolved = resolvePeriod('2025', options, now);

    expect(resolved.all).toBe(false);
    expect(resolved.from).toEqual(new Date('2025-07-31T22:00:00.000Z'));
    expect(resolved.to).toEqual(new Date('2026-08-31T21:59:59.999Z'));
  });

  it('resolves "from the beginning" to an all read with a bounded counter scope', () => {
    const resolved = resolvePeriod(FROM_THE_BEGINNING, options, now);

    expect(resolved.all).toBe(true);
    expect(resolved.to).toEqual(now);
    expect(resolved.from.getTime()).toBeLessThan(now.getTime());
  });

  it('treats an unknown value as "from the beginning"', () => {
    expect(resolvePeriod('nonsense', options, now).all).toBe(true);
  });

  it('falls back to the current academic year when the list is empty', () => {
    // The `??` arm: a caller that passed no year options still gets a bounded scope.
    const resolved = resolvePeriod(FROM_THE_BEGINNING, [], now);

    expect(resolved.from).toEqual(new Date('2026-07-31T22:00:00.000Z'));
  });
});

describe('conflict marking', () => {
  it('marks an unaccepted booking whose id is in the conflict set', () => {
    const marked = booking({_id: 'b1', accepted: false});

    expect(hasConflict(marked, ['b1', 'b2'])).toBe(true);
    expect(conflictLabel(marked, ['b1'], t)).toBe('Konflikt');
  });

  it('never marks an accepted booking, even when its id is in the set', () => {
    const accepted = booking({_id: 'b1', accepted: true});

    expect(hasConflict(accepted, ['b1'])).toBe(false);
    expect(conflictLabel(accepted, ['b1'], t)).toBe('');
  });

  it('leaves an unaccepted booking with no conflict unmarked', () => {
    expect(conflictLabel(booking({_id: 'b1'}), ['b2'], t)).toBe('');
  });
});

describe('toRow', () => {
  it('carries the labels the table renders and the accepted flag', () => {
    const row = toRow(booking({accepted: true}), [], t);

    expect(row).toMatchObject({
      _id: 'b1',
      nick: 'Klub',
      personName: 'Jan Kowalski',
      personPhone: '123456789',
      personEmail: 'jan@example.com',
      accepted: true,
      acceptedLabel: 'Tak',
      conflictLabel: '',
      hasConflict: false,
    });
  });

  it('shows the accepted label as "Nie" for an unaccepted booking', () => {
    expect(toRow(booking({accepted: false}), [], t)['acceptedLabel']).toBe('Nie');
  });

  it('includes the booking itself so the detail template can read its fields', () => {
    const source = booking();

    expect(toRow(source, [], t)['booking']).toBe(source);
  });
});

describe('slot labels', () => {
  it('formats a slot as a facility-local day and hour range', () => {
    expect(slotLabel(slot())).toBe('2026-08-04 01:00–02:00');
  });

  it('joins a booking\u2019s slots with a comma', () => {
    const bookingWithTwo = booking({
      bookedTimes: [slot(), slot({day: new Date('2026-08-04T22:00:00.000Z'), startHours: new Date('2026-08-04T23:00:00.000Z'), endHours: new Date('2026-08-05T00:00:00.000Z')})],
    });

    expect(slotsLabel(bookingWithTwo)).toBe('2026-08-04 01:00–02:00, 2026-08-05 01:00–02:00');
  });
});

describe('isResolved', () => {
  it('treats INITIAL as unresolved and every other status as resolved', () => {
    expect(isResolved(slot({status: 'INITIAL'}))).toBe(false);
    expect(isResolved(slot({status: 'DONE'}))).toBe(true);
    expect(isResolved(slot({status: 'CANCELED'}))).toBe(true);
  });
});

describe('replaceSlot', () => {
  const slots = [slot({status: 'INITIAL'}), slot({status: 'INITIAL'})];

  it('replaces only the targeted slot', () => {
    const replacement = slot({status: 'DONE'});
    const result = replaceSlot(slots, 1, replacement);

    expect(result[0]).toBe(slots[0]);
    expect(result[1]).toBe(replacement);
  });

  it('refuses an index outside the list', () => {
    expect(() => replaceSlot(slots, -1, slot())).toThrow(RangeError);
    expect(() => replaceSlot(slots, 2, slot())).toThrow(RangeError);
  });

  it('refuses to edit an already-resolved slot (FR-018)', () => {
    expect(() => replaceSlot([slot({status: 'DONE'})], 0, slot({status: 'INITIAL'}))).toThrow(
      'A resolved slot cannot be edited'
    );
  });
});

describe('toSlotRows', () => {
  it('shapes each slot with its labels and resolved flag', () => {
    const rows = toSlotRows(
      booking({bookedTimes: [slot({status: 'DONE', participants: 4, comments: 'ok'})]})
    , t);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      index: 0,
      dayLabel: '2026-08-04',
      hoursLabel: '01:00–02:00',
      statusLabel: 'Zakończona',
      status: 'DONE',
      participants: 4,
      comments: 'ok',
      resolved: true,
      startHour: 1,
      endHour: 2,
    });
  });

  it('leaves the optional fields undefined when the slot carries none', () => {
    const [row] = toSlotRows(booking({bookedTimes: [slot()]}), t);

    expect(row.participants).toBeUndefined();
    expect(row.comments).toBeUndefined();
    expect(row.resolved).toBe(false);
  });
});

describe('buildSlot', () => {
  it('anchors the day at facility-local midnight and converts the hours', () => {
    const built = buildSlot(new Date('2026-08-04T12:00:00.000Z'), 10, 12, 'INITIAL');

    expect(built.day).toEqual(new Date('2026-08-03T22:00:00.000Z'));
    expect(built.startHours).toEqual(new Date('2026-08-04T08:00:00.000Z'));
    expect(built.endHours).toEqual(new Date('2026-08-04T10:00:00.000Z'));
    expect(built.status).toBe('INITIAL');
  });

  it('carries the participants and comments when supplied', () => {
    const built = buildSlot(new Date('2026-08-04T12:00:00.000Z'), 10, 12, 'DONE', 3, 'note');

    expect(built.participants).toBe(3);
    expect(built.comments).toBe('note');
  });
});

describe('constants', () => {
  it('offers the legacy page sizes', () => {
    expect(PAGE_SIZES).toEqual([20, 50, 100]);
  });

  it('offers the legacy start and end hours', () => {
    expect(OPENING_HOUR).toBe(9);
    expect(END_OF_DAY_HOUR).toBe(24);
    expect(START_HOURS).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(END_HOURS).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  });

  it('labels every slot status with the report vocabulary', () => {
    // The same labels the CSV and the printable report print (CHK014, #55): the screen and the
    // report must not disagree on a status, which is the defect the legacy app had.
    expect(Object.values(STATUS_LABELS).map((key) => t(key))).toEqual([
      'Nie rozpoczęta',
      'Zakończona',
      'Rezygnacja',
    ]);
  });

  it('labels each status exactly as the CSV and the printable report do', () => {
    // The two maps live in different libraries on purpose (the UI copy is translatable, the
    // report vocabulary is the legacy Polish a business artefact prints), so nothing but this
    // assertion stops them drifting apart — which is what let the legacy dropdown say
    // "Odwołana" while its own CSV said "Rezygnacja" (issue #55). The report side is read
    // through `displayValue`, the function the CSV and the report both render with.
    for (const status of Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>) {
      expect(t(STATUS_LABELS[status])).toBe(displayValue(status));
    }
  });
});
