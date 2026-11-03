import {HttpException} from '@nestjs/common';

/**
 * An `HttpException` whose response body is supplied whole rather than derived.
 *
 * The global `ErrorExceptionFilter` maps every `HttpException` to the contract's
 * `{statusCode, message, error}` envelope, which is right for a plain error but
 * cannot express a body that carries data — the `409` on an approval that would keep
 * a conflict must return the conflicting bookings, or the UI cannot show the legacy
 * warning. Carrying the body on the exception keeps that decision with the feature
 * that knows what the extra field means, instead of teaching the global filter about
 * booking conflicts.
 *
 * It is still an `HttpException`, so a route that throws one behaves like any other
 * failure for guards, the logging interceptor and any code that inspects the status.
 */
export class StructuredHttpException extends HttpException {
  constructor(
    private readonly body: Record<string, unknown>,
    status: number
  ) {
    super(body, status);
  }

  /** The exact body to write, replacing the filter's derived envelope. */
  getBody(): Record<string, unknown> {
    return this.body;
  }
}
