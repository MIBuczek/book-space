import mongoose, {Model} from 'mongoose';
import {BookedTime, BookedTimeSchema} from './booked-time.schema';

// The schema's own validators are what is under test, so the real schema is used rather
// than a hand-built one. Cloning keeps the definitions while letting this spec turn command
// buffering off: without a database, validation still runs in memory, which is where the
// interval and participant rules live.
//
// `booking.schema.spec.ts` drives the same subdocument through its parent, which is the path
// production takes. This file exists for the branch that path cannot reach: the `endHours`
// validator's guard against a value that is not a `Date`. Under parent validation the
// `type: Date` cast has already run, so the guard's true arm is only reachable by calling the
// validator with a non-Date value directly.
const isolatedSchema = BookedTimeSchema.clone();
isolatedSchema.set('bufferCommands', false);

let BookedTimeModel: Model<BookedTime>;

beforeAll(() => {
  BookedTimeModel = mongoose.model<BookedTime>('BookedTimeSchemaSpec', isolatedSchema);
});

afterAll(() => {
  mongoose.deleteModel('BookedTimeSchemaSpec');
});

const slot = (overrides: Record<string, unknown> = {}) => ({
  day: new Date('2026-03-04T00:00:00Z'),
  startHours: new Date('2026-03-04T08:00:00Z'),
  endHours: new Date('2026-03-04T10:00:00Z'),
  status: 'INITIAL',
  ...overrides,
});

const errorsFor = (overrides: Record<string, unknown>) =>
  new BookedTimeModel(slot(overrides)).validateSync()?.errors ?? {};

describe('BookedTimeSchema', () => {
  it('accepts a valid slot', () => {
    expect(errorsFor({})).toEqual({});
  });

  it('requires a day, a start and an end', () => {
    expect(errorsFor({day: undefined})).toHaveProperty('day');
    expect(errorsFor({startHours: undefined})).toHaveProperty('startHours');
    expect(errorsFor({endHours: undefined})).toHaveProperty('endHours');
  });

  it('rejects a status outside the enum', () => {
    expect(errorsFor({status: 'QUIT'})).toHaveProperty('status');
  });

  it('rejects a non-integer participant count', () => {
    expect(errorsFor({participants: 1.5})).toHaveProperty('participants');
  });

  it('accepts an absent participant count', () => {
    expect(errorsFor({participants: undefined})).toEqual({});
  });
});

/**
 * The `endHours` interval validator (FR-012) in isolation. The DTO answers `422` at the
 * boundary; this is the defensive half that stops a migration or a script writing an
 * inverted interval directly. Calling the validator rather than validating a document is
 * what reaches the non-`Date` guard, because `validateSync` casts `type: Date` first.
 */
describe('BookedTimeSchema endHours validator', () => {
  const validator = BookedTimeSchema.path('endHours').validators.find(
    (entry) => entry.message === 'End hours need to be after start hours'
  )?.validator as (this: BookedTime, value: unknown) => boolean;

  it('accepts an end strictly after the start', () => {
    const slotDoc = new BookedTimeModel(slot());
    expect(validator.call(slotDoc, new Date('2026-03-04T10:00:00Z'))).toBe(true);
  });

  it('rejects an end equal to or before the start', () => {
    const slotDoc = new BookedTimeModel(slot());
    expect(validator.call(slotDoc, new Date('2026-03-04T08:00:00Z'))).toBe(false);
    expect(validator.call(slotDoc, new Date('2026-03-04T07:00:00Z'))).toBe(false);
  });

  it('leaves a non-Date end to the type cast rather than reporting a second error', () => {
    // Returning `true` keeps a single, clear error per problem: a malformed value is the
    // `type: Date` cast's to reject, and a second message for the same field would make the
    // client's error list ambiguous.
    const slotDoc = new BookedTimeModel(slot());
    expect(validator.call(slotDoc, 'nope')).toBe(true);
  });

  it('leaves a missing sibling start to the required rule', () => {
    const slotDoc = new BookedTimeModel(slot({startHours: undefined}));
    expect(validator.call(slotDoc, new Date('2026-03-04T10:00:00Z'))).toBe(true);
  });
});
