import {randomUUID} from 'node:crypto';
import {NextFunction, Request, Response} from 'express';
import {runWithRequestContext} from './request-context';

export const CORRELATION_ID_HEADER = 'x-request-id';

/**
 * Attaches an id to the request so every log line produced while handling it
 * can be tied together, and echoes it back so a caller can quote it when
 * reporting a failure. An id supplied by the caller is reused only when it is
 * a plain token, because a header value is otherwise free to carry arbitrary
 * content into the log record.
 *
 * The rest of the request runs inside `runWithRequestContext`, so handlers and
 * services see the id without it being threaded through their signatures.
 * Establishing the context here, rather than in an interceptor, is what makes
 * it cover the whole pipeline: an interceptor returns an observable that is
 * subscribed after it has returned, by which point a context opened around its
 * body would already have been left.
 */
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.headers[CORRELATION_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const correlationId = candidate && /^[\w.-]{1,128}$/.test(candidate) ? candidate : randomUUID();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  runWithRequestContext({correlationId}, next);
};
