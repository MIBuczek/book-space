import {IPublicBuilding} from '@models/building.model';
import {
  CITY_LABELS,
  CLIENT_TYPE_LABELS,
  END_HOUR_OPTIONS,
  PAYMENT_LABELS,
  START_HOUR_OPTIONS,
  buildExtraOptions,
  buildRequest,
  buildSlots,
  maxSelectableDay,
  minSelectableDay,
  sizeOptions,
  slotHoursValid,
  slotOverlapWarning,
  supportsExtraOptions,
  validateForm,
} from './booking-request-form';
import type {IBookingFormValue, IExtraOptionEntry} from './booking-request-form';
import {facilityWallClock} from '@booking/date-time';

const facility = (overrides: Partial<IPublicBuilding> = {}): IPublicBuilding => ({
  _id: 'f1',
  name: 'Boisko ze sztuczną nawierzchnią',
  property: 'boisko-sztuczna-nawierzchnia',
  city: 'siechnice',
  sizes: ['1/1', '1/2'],
  lighting: true,
  toilets: true,
  ...overrides,
});

const value = (overrides: Partial<IBookingFormValue> = {}): IBookingFormValue => ({
  type: 'INDIVIDUAL',
  size: '1/1',
  nick: 'Klub Pływacki',
  personName: 'Jan Kowalski',
  personCompany: '',
  personEmail: 'jan@example.com',
  personPhone: '600100200',
  comments: '',
  paymentMethod: 'TRANSFER',
  discount: '',
  rodoAcknowledgement: true,
  ...overrides,
});

const localDay = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe('booking request form labels and options', () => {
  it('labels the client types as the legacy form did', () => {
    expect(CLIENT_TYPE_LABELS).toEqual({INDIVIDUAL: 'Osoba prywatna', COMPANY: 'Firma'});
  });

  it('labels the payment methods as the legacy form did', () => {
    expect(PAYMENT_LABELS).toEqual({TRANSFER: 'Przelew', CASH: 'Gotówka', FREE: 'Bezpłatne'});
  });

  it('labels the four cities', () => {
    expect(CITY_LABELS['zerniki-wroclawskie']).toBe('Żerniki Wrocławskie');
  });

  it('offers the start hours 09 through 23', () => {
    expect(START_HOUR_OPTIONS[0]).toBe(9);
    expect(START_HOUR_OPTIONS.at(-1)).toBe(23);
  });

  it('offers the end hours 10 through 24, so a slot always ends after it starts', () => {
    expect(END_HOUR_OPTIONS[0]).toBe(10);
    expect(END_HOUR_OPTIONS.at(-1)).toBe(24);
  });
});

describe('sizeOptions', () => {
  it('returns the facility sizes', () => {
    expect(sizeOptions(facility())).toEqual(['1/1', '1/2']);
  });

  it('returns an empty list when no facility is selected', () => {
    expect(sizeOptions(undefined)).toEqual([]);
  });
});

describe('supportsExtraOptions', () => {
  it('is true when the facility has lighting', () => {
    expect(supportsExtraOptions(facility({lighting: true, toilets: false}))).toBe(true);
  });

  it('is true when the facility has a sanitary back-of-house', () => {
    expect(supportsExtraOptions(facility({lighting: false, toilets: true}))).toBe(true);
  });

  it('is false when the facility has neither', () => {
    expect(supportsExtraOptions(facility({lighting: false, toilets: false}))).toBe(false);
  });

  it('is false when no facility is selected', () => {
    expect(supportsExtraOptions(undefined)).toBe(false);
  });
});

describe('maxSelectableDay', () => {
  it('allows until the end of the current year before August', () => {
    const max = maxSelectableDay(new Date('2026-06-15T12:00:00Z'));
    expect(facilityWallClock(max)).toMatchObject({year: 2026, month: 12, day: 31, hour: 0});
  });

  it('extends into the next year from August, so the picker does not run out mid-season', () => {
    const max = maxSelectableDay(new Date('2026-08-01T12:00:00Z'));
    expect(facilityWallClock(max)).toMatchObject({year: 2027, month: 12, day: 31});
  });
});

describe('minSelectableDay', () => {
  it('is the facility-local start of today', () => {
    const min = minSelectableDay(new Date('2026-06-15T12:00:00Z'));
    expect(facilityWallClock(min)).toMatchObject({year: 2026, month: 6, day: 15, hour: 0});
  });
});

describe('validateForm', () => {
  it('accepts a complete value', () => {
    expect(validateForm(value())).toEqual({});
  });

  it('rejects a nick outside 3–100', () => {
    expect(validateForm(value({nick: 'ab'})).nick).toContain('3');
    expect(validateForm(value({nick: 'x'.repeat(101)})).nick).toContain('100');
  });

  it('rejects a person name outside 3–125', () => {
    expect(validateForm(value({personName: 'ab'})).personName).toBeDefined();
    expect(validateForm(value({personName: 'x'.repeat(126)})).personName).toBeDefined();
  });

  it('rejects a company name longer than 125', () => {
    expect(validateForm(value({personCompany: 'x'.repeat(126)})).personCompany).toBeDefined();
  });

  it('rejects an e-mail without an @, or outside 3–125', () => {
    expect(validateForm(value({personEmail: 'nope'})).personEmail).toBeDefined();
    expect(validateForm(value({personEmail: 'a@b'})).personEmail).toBeDefined();
    expect(validateForm(value({personEmail: `${'x'.repeat(124)}@`})).personEmail).toBeDefined();
  });

  it('rejects a phone outside 9–15', () => {
    expect(validateForm(value({personPhone: '123'})).personPhone).toBeDefined();
    expect(validateForm(value({personPhone: '1'.repeat(16)})).personPhone).toBeDefined();
  });

  it('rejects comments longer than 525', () => {
    expect(validateForm(value({comments: 'x'.repeat(526)})).comments).toBeDefined();
  });

  it('rejects a discount that is not a percentage, and accepts a blank one', () => {
    expect(validateForm(value({discount: '10'})).discount).toBeDefined();
    expect(validateForm(value({discount: '10%'})).discount).toBeUndefined();
  });
});

describe('slotHoursValid', () => {
  it('accepts an end after the start, including midnight as 24', () => {
    expect(slotHoursValid(9, 10)).toBe(true);
    expect(slotHoursValid(22, 24)).toBe(true);
  });

  it('rejects an end at or before the start', () => {
    expect(slotHoursValid(10, 10)).toBe(false);
    expect(slotHoursValid(10, 9)).toBe(false);
  });
});

describe('buildSlots', () => {
  it('expands a plain entry to one slot', () => {
    const slots = buildSlots(
      [{day: localDay('2026-06-01'), startHour: 8, endHour: 9}],
      []
    );

    expect(slots).toHaveLength(1);
    expect(facilityWallClock(slots[0].startHours)).toMatchObject({hour: 8});
  });

  it('expands a cyclical entry to its weekly series', () => {
    const slots = buildSlots(
      [],
      [{startDay: localDay('2026-06-01'), endDay: localDay('2026-06-22'), startHour: 8, endHour: 9}]
    );

    expect(slots).toHaveLength(4);
  });

  it('combines plain and cyclical entries', () => {
    const slots = buildSlots(
      [{day: localDay('2026-07-01'), startHour: 8, endHour: 9}],
      [{startDay: localDay('2026-06-01'), endDay: localDay('2026-06-08'), startHour: 8, endHour: 9}]
    );

    expect(slots).toHaveLength(3);
  });
});

describe('slotOverlapWarning', () => {
  it('names the later day of the first overlapping pair', () => {
    const slots = buildSlots(
      [
        {day: localDay('2026-06-01'), startHour: 13, endHour: 15},
        {day: localDay('2026-06-01'), startHour: 14, endHour: 16},
      ],
      []
    );

    expect(slotOverlapWarning(slots)).toEqual(slots[1].day);
  });

  it('returns null when nothing overlaps', () => {
    const slots = buildSlots(
      [
        {day: localDay('2026-06-01'), startHour: 8, endHour: 9},
        {day: localDay('2026-06-02'), startHour: 8, endHour: 9},
      ],
      []
    );

    expect(slotOverlapWarning(slots)).toBeNull();
  });
});

describe('buildExtraOptions', () => {
  const entry = (overrides: Partial<IExtraOptionEntry> = {}): IExtraOptionEntry => ({
    day: localDay('2026-06-01'),
    fromHour: 9,
    toHour: 11,
    lights: true,
    toilets: false,
    ...overrides,
  });

  it('records lighting only', () => {
    expect(buildExtraOptions([entry({lights: true, toilets: false})])[0].options).toEqual([
      {lights: true},
    ]);
  });

  it('records the sanitary back-of-house only', () => {
    expect(buildExtraOptions([entry({lights: false, toilets: true})])[0].options).toEqual([
      {toilets: true},
    ]);
  });

  it('records both add-ons', () => {
    expect(buildExtraOptions([entry({lights: true, toilets: true})])[0].options).toEqual([
      {lights: true},
      {toilets: true},
    ]);
  });

  it('drops an entry that selected neither add-on', () => {
    expect(buildExtraOptions([entry({lights: false, toilets: false})])).toEqual([]);
  });

  it('places the hour range on the facility-local day', () => {
    const [option] = buildExtraOptions([entry()]);
    expect(facilityWallClock(option.fromHour)).toMatchObject({day: 1, hour: 9});
    expect(facilityWallClock(option.toHour)).toMatchObject({day: 1, hour: 11});
  });
});

describe('buildRequest', () => {
  const slots = buildSlots([{day: localDay('2026-06-01'), startHour: 8, endHour: 9}], []);

  it('pairs the facility key with its city, and derives the month index', () => {
    const request = buildRequest(value(), facility(), slots);

    expect(request.place).toEqual({place: 'boisko-sztuczna-nawierzchnia', city: 'siechnice'});
    expect(request.month).toBe(5);
    expect(request.bookedTimes).toBe(slots);
    expect(request.rodoAcknowledgement).toBe(true);
  });

  it('omits the optional fields when they are blank', () => {
    const request = buildRequest(value(), facility(), slots);

    expect(request.personCompany).toBeUndefined();
    expect(request.comments).toBeUndefined();
    expect(request.discount).toBeUndefined();
    expect(request.selectedOptions).toBeUndefined();
  });

  it('includes the optional fields when they are set', () => {
    const request = buildRequest(
      value({personCompany: 'Acme', comments: 'Proszę o fakturę', discount: '10%'}),
      facility(),
      slots
    );

    expect(request.personCompany).toBe('Acme');
    expect(request.comments).toBe('Proszę o fakturę');
    expect(request.discount).toBe('10%');
  });

  it('includes the add-ons when the facility supports them', () => {
    const request = buildRequest(value(), facility(), slots, [
      {day: localDay('2026-06-01'), fromHour: 9, toHour: 11, lights: true, toilets: false},
    ]);

    expect(request.selectedOptions).toHaveLength(1);
  });
});
