import {Logger} from '@nestjs/common';
import {StructuredLogger} from './structured-logger';
import {runWithRequestContext} from './request-context';

/**
 * The logger is the one place that decides what a record contains, so it is
 * tested directly as well as through a request. The transport is stubbed with a
 * spy on Nest's Logger, which is the seam the application itself uses.
 */
describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let emitted: Record<string, unknown>[];

  // All three levels share the buffer, so a record written at `error` is read
  // back the same way as one written at `log`.
  const lastRecord = (): Record<string, unknown> => emitted[emitted.length - 1];

  beforeEach(() => {
    emitted = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation(((message: string) => {
      emitted.push(JSON.parse(message) as Record<string, unknown>);
    }) as never);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(((message: string) => {
      emitted.push(JSON.parse(message) as Record<string, unknown>);
    }) as never);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(((message: string) => {
      emitted.push(JSON.parse(message) as Record<string, unknown>);
    }) as never);
    logger = new StructuredLogger();
  });

  afterEach(() => jest.restoreAllMocks());

  it('emits one JSON object carrying the message and level', () => {
    logger.log('booking.created', {bookingId: 'abc'});

    expect(lastRecord()).toMatchObject({message: 'booking.created', level: 'log', bookingId: 'abc'});
    expect(typeof lastRecord().timestamp).toBe('string');
  });

  it('attaches the ambient correlation id', () => {
    runWithRequestContext({correlationId: 'trace-1'}, () => logger.log('booking.created'));

    expect(lastRecord().correlationId).toBe('trace-1');
  });

  it('redacts a password passed as a field', () => {
    logger.log('user.updated', {password: 'hunter2', userId: 'u1'});

    expect(lastRecord().password).toBe('[redacted]');
    expect(JSON.stringify(emitted)).not.toContain('hunter2');
  });

  it('makes a notification failure identifiable from the record alone', () => {
    logger.notificationFailure({
      bookingId: '507f1f77bcf86cd799439011',
      provider: 'smtp',
      response: '550 mailbox unavailable',
    });

    expect(lastRecord()).toMatchObject({
      message: 'notification.failed',
      level: 'error',
      bookingId: '507f1f77bcf86cd799439011',
      provider: 'smtp',
      response: '550 mailbox unavailable',
    });
  });

  it('does not write a recipient address into the record', () => {
    logger.notificationFailure({
      bookingId: 'b1',
      provider: 'smtp',
      response: 'sent',
      recipient: 'anna@example.com',
    } as never);

    expect(JSON.stringify(emitted)).not.toContain('anna@example.com');
  });
});
