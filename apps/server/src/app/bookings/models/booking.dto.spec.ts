import {validate} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {BookingDto} from './booking.dto';

/**
 * `paymentMethod` is validated against a list written out by hand in the DTO,
 * separate from the `TPayment` type. The two had already drifted: the DTO and
 * the type both said `CARD`, while `data-model.md` and the legacy application
 * (which offers Przelew / Gotówka / Bezpłatne) say `FREE`. A booking recorded as
 * free would be rejected on write, and `CARD` was accepted for a payment method
 * the business does not use.
 *
 * These assert on the property errors that actually matter rather than on the
 * whole error list, so an unrelated validator change does not make them fail.
 */
describe('BookingDto payment method', () => {
  const baseBooking = {
    type: 'INDIVIDUAL',
    place: {place: 'Sala A', city: 'siechnice'},
    size: '1/1',
    clientId: '507f1f77bcf86cd799439011',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Anna Kowalska',
    personCompany: 'Firma',
    personEmail: 'anna@example.com',
    personPhone: '123456789',
    month: 3,
    bookedTimes: [
      {
        day: new Date('2026-04-01'),
        startHours: new Date('2026-04-01T10:00:00Z'),
        endHours: new Date('2026-04-01T12:00:00Z'),
        status: 'INITIAL',
        participants: 10,
        comments: 'ok',
      },
    ],
    comments: 'ok',
  };

  const paymentErrors = async (paymentMethod: string): Promise<string[]> => {
    const dto = plainToInstance(BookingDto, {...baseBooking, paymentMethod});
    const errors = await validate(dto, {whitelist: true});
    return errors
      .filter((error) => error.property === 'paymentMethod')
      .flatMap((error) => Object.values(error.constraints ?? {}));
  };

  it.each(['CASH', 'TRANSFER', 'FREE'])('accepts %s', async (method) => {
    expect(await paymentErrors(method)).toEqual([]);
  });

  it('rejects CARD, which the business does not use', async () => {
    expect(await paymentErrors('CARD')).not.toEqual([]);
  });
});

/**
 * The fields T010 added to the request body. Each is asserted through the same
 * `validate`/`plainToInstance` path the global pipe uses, so a decorator that is present
 * but not wired is caught here rather than in production.
 */
describe('BookingDto new fields', () => {
  const baseBooking = {
    type: 'INDIVIDUAL',
    place: {place: 'Sala A', city: 'siechnice'},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Anna Kowalska',
    personEmail: 'anna@example.com',
    personPhone: '123456789',
    month: 3,
    bookedTimes: [{day: new Date('2026-04-01'), startHours: new Date('2026-04-01T10:00:00Z'), endHours: new Date('2026-04-01T12:00:00Z'), status: 'INITIAL'}],
    paymentMethod: 'CASH',
  };

  const errorsFor = async (overrides: Record<string, unknown>): Promise<string[]> => {
    const dto = plainToInstance(BookingDto, {...baseBooking, ...overrides});
    const errors = await validate(dto, {whitelist: true, forbidNonWhitelisted: true});
    return errors.map((error) => error.property);
  };

  it('accepts a complete booking', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('requires a nick', async () => {
    expect(await errorsFor({nick: undefined})).toContain('nick');
  });

  it('rejects a nick shorter than three characters', async () => {
    expect(await errorsFor({nick: 'ab'})).toContain('nick');
  });

  it('accepts a percentage discount', async () => {
    expect(await errorsFor({discount: '10%'})).not.toContain('discount');
  });

  it('rejects a discount that is not a percentage', async () => {
    expect(await errorsFor({discount: '10'})).toContain('discount');
  });

  it('accepts selected add-ons with from and to hours', async () => {
    const selectedOptions = [
      {options: [{lights: true}], fromHour: new Date('2026-04-01T10:00:00Z'), toHour: new Date('2026-04-01T12:00:00Z')},
    ];

    expect(await errorsFor({selectedOptions})).not.toContain('selectedOptions');
  });

  it('rejects an add-on without hours', async () => {
    const selectedOptions = [{options: [{lights: true}], fromHour: 'nope', toHour: 'nope'}];

    expect(await errorsFor({selectedOptions})).toContain('selectedOptions');
  });

  it('rejects a body that tries to set the derived extraOptions flag', async () => {
    // `extraOptions` is computed from `selectedOptions`; a body that sets it would be a
    // second source of truth for the same fact.
    expect(await errorsFor({extraOptions: true})).toContain('extraOptions');
  });

  it('rejects a body that tries to set createdBy', async () => {
    expect(await errorsFor({createdBy: 'someone-else'})).toContain('createdBy');
  });

  it('rejects a body that tries to set accepted or archive', async () => {
    // T023: the flags are administrator decisions taken on the approve/archive routes, so
    // they are no longer part of the request body and `forbidNonWhitelisted` refuses them.
    expect(await errorsFor({accepted: true})).toContain('accepted');
    expect(await errorsFor({archive: true})).toContain('archive');
  });

  it('accepts the RODO acknowledgement', async () => {
    expect(await errorsFor({rodoAcknowledgement: true})).not.toContain('rodoAcknowledgement');
  });

  it('rejects a non-boolean RODO acknowledgement', async () => {
    expect(await errorsFor({rodoAcknowledgement: 'yes'})).toContain('rodoAcknowledgement');
  });
});
