import {ValidationPipeOptions} from '@nestjs/common';

/**
 * The options the global `ValidationPipe` is built from, shared so a route that needs
 * the same strictness can reuse them rather than restate the values.
 *
 * The global pipe in `configure-app.ts` validates an object body against its DTO class.
 * A route whose body is a top-level *array* cannot use it: Nest's `ValidationPipe`
 * declines an `Array` metatype, so the items are never checked. The idiomatic way to
 * validate an array body is `ParseArrayPipe`, which wraps its own `ValidationPipe` and
 * forwards these options to it — but only if it is given them. Exporting the object is
 * what keeps `whitelist`/`forbidNonWhitelisted`/422 in one place instead of a second,
 * drifting copy on the array route.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  // Strip properties the DTO does not declare, and reject the request rather than
  // silently ignoring them (mass-assignment guard).
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {enableImplicitConversion: true},
  // The contract declares 422 for validation failures; Nest defaults to 400.
  errorHttpStatusCode: 422,
};
