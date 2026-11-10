import {ExecutionContext, HttpException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {RateLimitStore} from './rate-limit.store';
import {RateLimitGuard} from './rate-limit.guard';

/**
 * The guard, driven through a hand-built execution context.
 *
 * The store's own window behaviour is covered by `rate-limit.store.spec.ts`; what matters here
 * is which *keys* the guard counts (IP and submitted address) and that it answers `429` rather
 * than letting the request through. A real `ExecutionContext` is overkill, so the two methods
 * the guard uses are stubbed.
 */
const contextFor = (request: {ip?: string; body?: Record<string, unknown>}): ExecutionContext =>
  ({
    switchToHttp: () => ({getRequest: () => request})
  }) as unknown as ExecutionContext;

const configWith = (values: Record<string, string>): ConfigService =>
  ({get: (key: string) => values[key]}) as unknown as ConfigService;

describe('RateLimitGuard', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new RateLimitStore();
  });

  it('lets a request through while under the limit', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '2'}));
    expect(guard.canActivate(contextFor({ip: '10.0.0.1'}))).toBe(true);
    expect(guard.canActivate(contextFor({ip: '10.0.0.1'}))).toBe(true);
  });

  it('answers 429 past the per-IP limit', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '2'}));
    guard.canActivate(contextFor({ip: '10.0.0.1'}));
    guard.canActivate(contextFor({ip: '10.0.0.1'}));

    expect(() => guard.canActivate(contextFor({ip: '10.0.0.1'}))).toThrow(HttpException);
    try {
      guard.canActivate(contextFor({ip: '10.0.0.1'}));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('counts a second key by the submitted e-mail, so a rotated IP does not evade the limit', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '1'}));

    expect(guard.canActivate(contextFor({ip: '10.0.0.1', body: {email: 'anna@example.com'}}))).toBe(true);
    // A different IP, the same address: refused by the e-mail key.
    expect(() => guard.canActivate(contextFor({ip: '10.0.0.2', body: {email: 'anna@example.com'}}))).toThrow(HttpException);
  });

  it('treats the submitted address case-insensitively', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '1'}));
    guard.canActivate(contextFor({ip: '10.0.0.1', body: {email: 'Anna@Example.com'}}));
    expect(() => guard.canActivate(contextFor({ip: '10.0.0.1', body: {email: 'anna@example.com'}}))).toThrow(HttpException);
  });

  it('skips the e-mail key when the body carries none', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '5'}));
    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(contextFor({ip: '10.0.0.1', body: {}}))).toBe(true);
    }
  });

  it('ignores a non-string sender field rather than keying on it', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '2'}));
    expect(guard.canActivate(contextFor({ip: '10.0.0.1', body: {email: 42}}))).toBe(true);
    expect(guard.canActivate(contextFor({ip: '10.0.0.1', body: {email: '   '}}))).toBe(true);
    expect(() => guard.canActivate(contextFor({ip: '10.0.0.1'}))).toThrow(HttpException);
  });

  it('disables the check when the limit is zero', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '0'}));
    for (let i = 0; i < 50; i += 1) {
      expect(guard.canActivate(contextFor({ip: '10.0.0.1'}))).toBe(true);
    }
  });

  it('falls back to the default when the setting is not a number', () => {
    // A typo must not disable the limit; the default (12) applies.
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: 'lots'}));
    for (let i = 0; i < 12; i += 1) {
      expect(guard.canActivate(contextFor({ip: '10.0.0.1'}))).toBe(true);
    }
    expect(() => guard.canActivate(contextFor({ip: '10.0.0.1'}))).toThrow(HttpException);
  });

  it('treats an empty setting as absent, not as zero', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: ''}));
    for (let i = 0; i < 12; i += 1) {
      expect(guard.canActivate(contextFor({ip: '10.0.0.1'}))).toBe(true);
    }
    expect(() => guard.canActivate(contextFor({ip: '10.0.0.1'}))).toThrow(HttpException);
  });

  it('falls back to the default client key when the request carries no address', () => {
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '1'}));
    expect(guard.canActivate(contextFor({}))).toBe(true);
    expect(() => guard.canActivate(contextFor({}))).toThrow(HttpException);
  });

  it('prunes on a cadence rather than on every request', () => {
    const prune = jest.spyOn(store, 'prune');
    const guard = new RateLimitGuard(store, configWith({PUBLIC_RATE_LIMIT: '50'}));
    guard.canActivate(contextFor({ip: '10.0.0.1'}));
    guard.canActivate(contextFor({ip: '10.0.0.1'}));
    // Two requests inside the same second sweep once, not twice.
    expect(prune).toHaveBeenCalledTimes(1);
  });
});
