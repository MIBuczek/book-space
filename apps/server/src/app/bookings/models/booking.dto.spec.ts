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
    accepted: false,
    archive: false,
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
