import {ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import {STATUS_CODES} from 'http';

/** The shape in `contracts/openapi.yaml`. `message` is a string for a single error. */
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

/** The shape in `contracts/openapi.yaml`. `message` is a list for validation failures. */
export interface ValidationErrorResponse {
  statusCode: number;
  message: string[];
  error: string;
}

/**
 * Maps every uncaught exception to the error shape in `contracts/openapi.yaml`,
 * so a client sees one envelope regardless of where the failure came from.
 *
 * The important job is what it *removes*. Controllers return service results
 * directly and services re-throw with the original message, so a database error
 * currently reaches the client verbatim — a duplicate key responds with the
 * collection name and the index definition. Anything that is not already an
 * `HttpException` is therefore treated as an unexpected failure: the client gets
 * a generic 500 and the real error is logged for the operator.
 */
@Catch()
export class ErrorExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorExceptionFilter.name);

  constructor(private readonly httpAdapter: HttpAdapterHost['httpAdapter']) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    // A 5xx body never carries the cause. The services currently catch a database
    // error and re-throw `new HttpException(rawMessage, 500)`, which is
    // indistinguishable from an intentional exception here — so a malformed id
    // responds with the Mongoose message naming the model. Treating every 5xx as
    // opaque closes that path and any future one like it, without having to
    // audit each throw site.
    const body =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? this.serverError(status, exception)
        : this.fromHttpException(exception as HttpException, status);

    this.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }

  /**
   * The generic body for a 5xx. The original is logged in full; the client is
   * told only that the request failed, because the message of an unexpected
   * failure is an implementation detail (model names, query shapes) and is not
   * something a caller can act on.
   */
  private serverError(status: number, exception: unknown): ErrorResponse {
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      statusCode: status,
      message: 'Internal server error',
      error: this.reasonPhrase(status),
    };
  }

  private fromHttpException(exception: HttpException, status: number): ErrorResponse | ValidationErrorResponse {
    const response = exception.getResponse();

    // `ValidationPipe` raises a `BadRequestException` whose response is
    // `{message: string[], error, statusCode}`. Nest puts the same list in a
    // bare array response. Both are validation errors and keep the list shape;
    // everything else collapses to a single message string.
    const messages = this.validationMessages(response);
    if (messages) {
      return {statusCode: status, message: messages, error: this.reasonPhrase(status)};
    }

    return {statusCode: status, message: this.singleMessage(response, exception), error: this.reasonPhrase(status)};
  }

  private validationMessages(response: string | object): string[] | null {
    const message = typeof response === 'object' && response !== null ? (response as {message?: unknown}).message : undefined;
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
      return message;
    }
    return null;
  }

  private singleMessage(response: string | object, exception: HttpException): string {
    if (typeof response === 'string') {
      return response;
    }
    const message = typeof response === 'object' && response !== null ? (response as {message?: unknown}).message : undefined;
    if (typeof message === 'string') {
      return message;
    }
    // A custom `HttpException` can carry any object as its response. Falling
    // back to the exception message keeps the contract's `message: string`
    // rather than emitting an arbitrary object where a string is declared.
    return exception.message;
  }

  /**
   * The status text a client expects in `error`, e.g. `Not Found` for 404.
   *
   * Read from Node's own table rather than from `HttpStatus`, which is a string
   * enum (`HttpStatus.NOT_FOUND === 'NOT_FOUND'`) and so cannot be indexed by
   * the numeric status. This also keeps the wire format independent of
   * `exception.name`, so a custom exception class cannot change it.
   */
  private reasonPhrase(status: number): string {
    return STATUS_CODES[status] ?? 'Error';
  }
}
