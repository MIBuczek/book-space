import {currentActorId, currentCorrelationId, runWithRequestContext, setActorId} from './request-context';

/**
 * The request context is an `AsyncLocalStorage`, so its readers have two arms each: the
 * store present (a request is being handled) and absent (a log line written outside one, or
 * a `setActorId` called after the context has unwound). Only the present arm runs in the
 * integration spec, because every call there is inside a request. The absent arm matters:
 * a service that logs during bootstrap, or a guard that runs outside the middleware, must
 * get `undefined` rather than throw on a missing store.
 */
describe('request context', () => {
  it('returns undefined for the correlation id and actor outside a request', () => {
    expect(currentCorrelationId()).toBeUndefined();
    expect(currentActorId()).toBeUndefined();
  });

  it('exposes the correlation id inside the context it was opened with', () => {
    runWithRequestContext({correlationId: 'trace-1'}, () => {
      expect(currentCorrelationId()).toBe('trace-1');
      // The actor is filled in later than the correlation id, so it is absent until set.
      expect(currentActorId()).toBeUndefined();
    });
  });

  it('lets a later writer attach the actor to the same store', () => {
    runWithRequestContext({correlationId: 'trace-2'}, () => {
      setActorId('user-1');
      expect(currentActorId()).toBe('user-1');
    });
  });

  it('ignores setActorId when no context is open', () => {
    // The store cannot be replaced for an in-flight request, so the writer mutates the
    // existing object; with no store there is nothing to mutate and the call is a no-op
    // rather than a crash.
    expect(() => setActorId('user-1')).not.toThrow();
    expect(currentActorId()).toBeUndefined();
  });
});
