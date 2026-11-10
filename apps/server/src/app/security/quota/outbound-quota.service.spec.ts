import {HttpException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {RateLimitStore} from '../rate-limit/rate-limit.store';
import {OutboundQuotaService} from './outbound-quota.service';

const configWith = (values: Record<string, string>): ConfigService =>
  ({get: (key: string) => values[key]}) as unknown as ConfigService;

describe('OutboundQuotaService', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new RateLimitStore();
  });

  it('allows sends up to the quota and refuses the next with 429', () => {
    const service = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: '2'}));

    expect(() => service.assertAllowed('biuro@example.com')).not.toThrow();
    expect(() => service.assertAllowed('biuro@example.com')).not.toThrow();

    try {
      service.assertAllowed('biuro@example.com');
      throw new Error('expected a 429');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('keeps a separate quota per recipient', () => {
    const service = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: '1'}));
    expect(() => service.assertAllowed('a@example.com')).not.toThrow();
    expect(() => service.assertAllowed('b@example.com')).not.toThrow();
    expect(() => service.assertAllowed('a@example.com')).toThrow(HttpException);
  });

  it('treats the same mailbox in different case as one recipient', () => {
    const service = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: '1'}));
    service.assertAllowed('Biuro@Example.com');
    expect(() => service.assertAllowed('biuro@example.com')).toThrow(HttpException);
  });

  it('disables the check when the quota is zero', () => {
    const service = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: '0'}));
    for (let i = 0; i < 50; i += 1) {
      expect(() => service.assertAllowed('biuro@example.com')).not.toThrow();
    }
  });

  it('falls back to the default for an empty or non-numeric quota', () => {
    const empty = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: ''}));
    for (let i = 0; i < 20; i += 1) {
      expect(() => empty.assertAllowed('biuro@example.com')).not.toThrow();
    }
    expect(() => empty.assertAllowed('biuro@example.com')).toThrow(HttpException);

    const nonNumeric = new OutboundQuotaService(store, configWith({NOTIFICATION_QUOTA: 'lots'}));
    for (let i = 0; i < 20; i += 1) {
      expect(() => nonNumeric.assertAllowed('other@example.com')).not.toThrow();
    }
    expect(() => nonNumeric.assertAllowed('other@example.com')).toThrow(HttpException);
  });

  it('treats a null setting as absent', () => {
    const service = new OutboundQuotaService(store, {
      get: () => null
    } as unknown as ConfigService);
    expect(() => service.assertAllowed('biuro@example.com')).not.toThrow();
  });
});
