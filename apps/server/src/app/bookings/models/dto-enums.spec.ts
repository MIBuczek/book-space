import {validate} from 'class-validator';
import {plainToInstance} from 'class-transformer';
import {CLIENT_TYPES, PAYMENTS} from '@models/booking.model';
import {BOOKING_STATUSES} from '@models/booked-time.model';
import {BookingDto} from './booking.dto';
import {BookedTimeDto} from './booked-time.dto';
import {ClientDto} from '../../clients/models/client.dto';

/**
 * Each DTO now validates against the shared list rather than an inline copy.
 * These assert the two are wired together: every value the shared list allows
 * is accepted, and a value it does not allow is rejected. The lists previously
 * drifted — the payment list said `CARD` while the data model and the legacy
 * application use `FREE` — so this is the check that keeps a new value from
 * being added to one place and not the other.
 */
const rejects = async (dto: object, property: string, value: unknown): Promise<boolean> => {
  const instance = plainToInstance(dto.constructor as new () => object, {[property]: value});
  const errors = await validate(instance, {skipMissingProperties: true});
  return errors.some((error) => error.property === property);
};

describe('DTOs validate against the shared enum lists', () => {
  it.each([...PAYMENTS])('BookingDto accepts paymentMethod %s', async (payment) => {
    expect(await rejects(BookingDto.prototype, 'paymentMethod', payment)).toBe(false);
  });

  it('BookingDto rejects a payment method outside the list', async () => {
    expect(await rejects(BookingDto.prototype, 'paymentMethod', 'CARD')).toBe(true);
  });

  it.each([...CLIENT_TYPES])('BookingDto accepts type %s', async (type) => {
    expect(await rejects(BookingDto.prototype, 'type', type)).toBe(false);
  });

  it('BookingDto rejects a client type outside the list', async () => {
    expect(await rejects(BookingDto.prototype, 'type', 'GOVERNMENT')).toBe(true);
  });

  it.each([...BOOKING_STATUSES])('BookedTimeDto accepts status %s', async (status) => {
    expect(await rejects(BookedTimeDto.prototype, 'status', status)).toBe(false);
  });

  it('BookedTimeDto rejects a status outside the list', async () => {
    expect(await rejects(BookedTimeDto.prototype, 'status', 'QUIT')).toBe(true);
  });

  it.each([...CLIENT_TYPES])('ClientDto accepts type %s', async (type) => {
    expect(await rejects(ClientDto.prototype, 'type', type)).toBe(false);
  });

  it('ClientDto rejects a client type outside the list', async () => {
    expect(await rejects(ClientDto.prototype, 'type', 'GOVERNMENT')).toBe(true);
  });
});
