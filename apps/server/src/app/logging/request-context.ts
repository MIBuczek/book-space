import {AsyncLocalStorage} from 'node:async_hooks';

interface IRequestContext {
  correlationId: string;
  actorId?: string;
}

/**
 * Holds the correlation id and the acting user for the request being handled,
 * so a service deep in the call stack can log against them without every method
 * taking them as arguments.
 *
 * The store is created by the correlation-id middleware, which runs before the
 * guards, and the actor is filled in by the request logger once the guard has
 * attached it. Both write to the same object because a store cannot be
 * replaced for an in-flight request.
 */
const storage = new AsyncLocalStorage<IRequestContext>();

export const runWithRequestContext = <T>(context: IRequestContext, callback: () => T): T =>
  storage.run(context, callback);

export const currentCorrelationId = (): string | undefined => storage.getStore()?.correlationId;

export const currentActorId = (): string | undefined => storage.getStore()?.actorId;

export const setActorId = (actorId: string | undefined): void => {
  const store = storage.getStore();
  if (store) {
    store.actorId = actorId;
  }
};
