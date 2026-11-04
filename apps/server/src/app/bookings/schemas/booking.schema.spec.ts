import mongoose, {Model} from 'mongoose';
import {Booking, BookingSchema} from './booking.schema';

// The schema's validators and defaults are what is under test, so the real schema is used
// rather than a hand-built one. Cloning keeps the definitions while letting this spec turn
// command buffering off: without a database, validation still runs in memory, which is where
// the discount pattern and the `extraOptions`/`selectedOptions` defaults live.
const isolatedSchema = BookingSchema.clone();
isolatedSchema.set('bufferCommands', false);

let BookingModel: Model<Booking>;

beforeAll(() => {
  BookingModel = mongoose.model<Booking>('BookingSchemaSpec', isolatedSchema);
});

afterAll(() => {
  mongoose.deleteModel('BookingSchemaSpec');
});

const booking = (overrides: Record<string, unknown> = {}) => ({
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Rezerwacja Kowalscy',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '500100200',
  month: 3,
  bookedTimes: [
    {day: new Date('2026-03-04T10:00:00Z'), startHours: new Date('2026-03-04T10:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z'), status: 'INITIAL'},
  ],
  accepted: true,
  archive: false,
  paymentMethod: 'CASH',
  ...overrides,
});

const errorsFor = (overrides: Record<string, unknown>) => {
  const doc = new BookingModel(booking(overrides));
  return doc.validateSync()?.errors ?? {};
};

describe('BookingSchema validation', () => {
  it('accepts a complete booking', () => {
    expect(errorsFor({})).toEqual({});
  });

  it('requires a nick', () => {
    expect(errorsFor({nick: undefined})).toHaveProperty('nick');
  });

  it('rejects a nick shorter than three characters', () => {
    expect(errorsFor({nick: 'ab'})).toHaveProperty('nick');
  });

  it('accepts a percentage discount', () => {
    expect(errorsFor({discount: '10%'})).toEqual({});
  });

  it('rejects a discount that is not a percentage', () => {
    expect(errorsFor({discount: '10'})).toHaveProperty('discount');
  });

  it('defaults extraOptions to false and selectedOptions to empty', () => {
    const doc = new BookingModel(booking({}));

    expect(doc.extraOptions).toBe(false);
    expect(doc.selectedOptions).toEqual([]);
  });

  it('defaults archive to false when it is omitted', () => {
    const doc = new BookingModel(booking({archive: undefined}));

    expect(doc.archive).toBe(false);
  });

  it('stores the add-ons it is given', () => {
    const selectedOptions = [
      {options: [{lights: true}], fromHour: new Date('2026-03-04T10:00:00Z'), toHour: new Date('2026-03-04T11:00:00Z')},
    ];
    const doc = new BookingModel(booking({selectedOptions, extraOptions: true}));

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.selectedOptions).toHaveLength(1);
  });
});
