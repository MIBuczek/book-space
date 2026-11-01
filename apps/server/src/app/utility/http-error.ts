import {HttpException, HttpStatus} from '@nestjs/common';

/**
 * Reads the message from an unknown catch binding. Mongoose errors, Nest
 * `HttpException`s and plain `Error`s all carry `message`, so this only has to
 * narrow the binding rather than trust a cast.
 */
export function errorMessage(e: unknown, fallback = 'Internal server error'): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === 'string') {
    return e;
  }
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const {message} = e as {message: unknown};
    if (typeof message === 'string') {
      return message;
    }
  }
  return fallback;
}

/**
 * Reads the HTTP status from an unknown catch binding.
 *
 * Only a Nest `HttpException` carries a status. A Mongoose error does not, so
 * reading `.status` off one yields `undefined` — and `new HttpException(message,
 * undefined)` makes Nest respond **200 OK**, reporting a failed write as success.
 * Anything that is not an `HttpException` is an unexpected failure and becomes a 500.
 */
export function errorStatus(e: unknown): number {
  return e instanceof HttpException ? e.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
}
