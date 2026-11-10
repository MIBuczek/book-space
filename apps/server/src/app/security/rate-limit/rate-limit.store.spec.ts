import {RateLimitStore} from './rate-limit.store';

/**
 * The fixed-window counter, driven directly with an explicit clock.
 *
 * `record` takes `now` as a parameter precisely so these cases can advance time without
 * waiting; a test that slept for a real window would be slow and flaky.
 */
describe('RateLimitStore', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new RateLimitStore();
  });

  it('allows up to the limit and refuses the next request', () => {
    const limit = 3;
    const windowMs = 1000;

    expect(store.record('k', limit, windowMs, 0).allowed).toBe(true);
    expect(store.record('k', limit, windowMs, 0).allowed).toBe(true);
    const third = store.record('k', limit, windowMs, 0);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = store.record('k', limit, windowMs, 0);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each key separately', () => {
    expect(store.record('a', 1, 1000, 0).allowed).toBe(true);
    expect(store.record('b', 1, 1000, 0).allowed).toBe(true);
    expect(store.record('a', 1, 1000, 0).allowed).toBe(false);
  });

  it('resets the counter once the window elapses', () => {
    expect(store.record('k', 1, 1000, 0).allowed).toBe(true);
    expect(store.record('k', 1, 1000, 500).allowed).toBe(false);
    // The window opened at 0 and lasts 1000ms, so at 1000 it is a fresh window.
    expect(store.record('k', 1, 1000, 1000).allowed).toBe(true);
  });

  it('treats a limit of zero as unlimited rather than as "refuse everything"', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(store.record('k', 0, 1000, 0).allowed).toBe(true);
    }
  });

  it('reports the seconds until the window resets', () => {
    store.record('k', 5, 10_000, 0);
    const verdict = store.record('k', 5, 10_000, 3_000);
    expect(verdict.retryAfterSeconds).toBe(7);
  });

  it('prunes expired windows so the map does not grow without bound', () => {
    store.record('a', 5, 1000, 0);
    store.record('b', 5, 1000, 0);
    expect(store.size()).toBe(2);

    store.prune(1000);
    expect(store.size()).toBe(0);
  });

  it('leaves a window that has not yet expired in place when pruning', () => {
    store.record('live', 5, 10_000, 0);
    store.record('expired', 5, 1000, 0);

    store.prune(2000);
    expect(store.size()).toBe(1);
  });

  it('clear() empties every window', () => {
    store.record('a', 5, 1000, 0);
    store.record('b', 5, 1000, 0);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('defaults the clock to now when none is given', () => {
    expect(store.record('k', 5, 1000).allowed).toBe(true);
    expect(store.size()).toBe(1);
    store.prune();
    expect(store.size()).toBe(1);
  });
});
