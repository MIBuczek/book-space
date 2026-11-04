import {validate, ValidationError} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {BookedTimeDto} from './booked-time.dto';
import {BookingDto} from './booking.dto';

/**
 * T011: the slot rules the legacy application enforced only in the browser.
 *
 * `endHours` must be strictly after `startHours` (FR-012) and `participants` must be a
 * number in 0–50. These run through the same `validate`/`plainToInstance` path the global
 * pipe uses, so a decorator that is present but not wired is caught here. Dates are passed
 * as `Date` instances because this path does not run the pipe's implicit conversion; the
 * integration spec covers the string form a client actually sends.
 */
const slot = (overrides: Record<string, unknown> = {}) => ({
  day: new Date('2026-03-04T00:00:00Z'),
  startHours: new Date('2026-03-04T08:00:00Z'),
  endHours: new Date('2026-03-04T10:00:00Z'),
  status: 'INITIAL',
  ...overrides,
});

const slotErrors = (overrides: Record<string, unknown>): Promise<ValidationError[]> =>
  validate(plainToInstance(BookedTimeDto, slot(overrides)), {whitelist: true});

describe('BookedTimeDto interval', () => {
  it('accepts an end after the start', async () => {
    expect(await slotErrors({})).toEqual([]);
  });

  it('rejects an end before the start with a field-level message', async () => {
    const errors = await slotErrors({
      startHours: new Date('2026-03-04T10:00:00Z'),
      endHours: new Date('2026-03-04T08:00:00Z'),
    });

    const endErrors = errors.filter((error) => error.property === 'endHours');
    expect(endErrors).toHaveLength(1);
    expect(Object.values(endErrors[0].constraints ?? {})).toContain('End hours need to be after start hours');
  });

  it('rejects an end equal to the start', async () => {
    const errors = await slotErrors({
      startHours: new Date('2026-03-04T10:00:00Z'),
      endHours: new Date('2026-03-04T10:00:00Z'),
    });

    expect(errors.map((error) => error.property)).toContain('endHours');
  });

  it('does not also report the interval rule when the end is not a date', async () => {
    // A malformed value is `@IsDate`'s problem; a second message for the same field
    // would make the client's error list ambiguous.
    const errors = await slotErrors({endHours: 'nope'});
    const endErrors = errors.filter((error) => error.property === 'endHours');

    expect(endErrors).toHaveLength(1);
    expect(Object.values(endErrors[0].constraints ?? {})).toEqual(['Value need to be Date type.']);
  });
});

describe('BookedTimeDto participants', () => {
  it.each([0, 50])('accepts %i', async (participants) => {
    expect(await slotErrors({participants})).toEqual([]);
  });

  it('rejects a non-numeric value', async () => {
    const errors = await slotErrors({participants: 'ten'});

    expect(errors.map((error) => error.property)).toContain('participants');
  });

  it.each([-1, 51])('rejects %i as out of range', async (participants) => {
    const errors = await slotErrors({participants});

    expect(errors.map((error) => error.property)).toContain('participants');
  });

  it('accepts an absent value', async () => {
    // `contracts/openapi.yaml` lists only day/startHours/endHours/status as required.
    expect(await slotErrors({participants: undefined})).toEqual([]);
  });

  it('coerces a numeric string, as the legacy UI sent it', async () => {
    // The legacy form collected `participants` as a string, so the value arrives as one.
    // The global pipe runs with `enableImplicitConversion`, which coerces against the
    // declared `number` type — the same mechanism `month`, `page` and `limit` rely on —
    // so a numeric string is accepted and stored as a number. A non-numeric string is not
    // coercible and `@IsInt` rejects it (asserted above).
    const instance = plainToInstance(
      BookedTimeDto,
      slot({participants: '10'}),
      {enableImplicitConversion: true}
    );
    const errors = await validate(instance, {whitelist: true});

    expect(instance.participants).toBe(10);
    expect(typeof instance.participants).toBe('number');
    expect(errors).toEqual([]);
  });
});

/**
 * `BookingDto.bookedTimes` is the create path, and the crafted payload the issue names
 * reaches the API through it. Without `@ValidateNested` the items were never checked —
 * the field had `@ArrayMinSize` and nothing else, so every slot rule was absent on create.
 */
describe('BookingDto nested booked times', () => {
  const booking = (bookedTimes: unknown): Record<string, unknown> => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala', city: 'siechnice'},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Anna Kowalska',
    personEmail: 'anna@example.com',
    personPhone: '123456789',
    month: 3,
    bookedTimes,
    accepted: false,
    archive: false,
    paymentMethod: 'CASH',
  });

  const nestedSlotErrors = async (bookedTimes: unknown): Promise<ValidationError[]> => {
    const errors = await validate(plainToInstance(BookingDto, booking(bookedTimes)), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const children = errors.find((error) => error.property === 'bookedTimes')?.children ?? [];
    // `@ValidateNested({each: true})` nests one level per array index, so the field
    // errors are the grandchildren of `bookedTimes` rather than its children.
    return children.flatMap((child) => child.children ?? []);
  };

  it('accepts a valid slot', async () => {
    expect(await nestedSlotErrors([slot()])).toEqual([]);
  });

  it('rejects an inverted interval inside the create body', async () => {
    const children = await nestedSlotErrors([
      slot({startHours: new Date('2026-03-04T10:00:00Z'), endHours: new Date('2026-03-04T08:00:00Z')}),
    ]);

    expect(children.some((child) => child.property === 'endHours')).toBe(true);
  });

  it('rejects a non-numeric participant inside the create body', async () => {
    const children = await nestedSlotErrors([slot({participants: 'ten'})]);

    expect(children.some((child) => child.property === 'participants')).toBe(true);
  });
});
