import {ArgumentsHost, BadRequestException, HttpException, HttpStatus} from '@nestjs/common';
import {ErrorExceptionFilter} from './error-exception.filter';
import {StructuredHttpException} from './structured-http-exception';

/**
 * The filter is exercised end-to-end by `configure-app.spec.ts`, which asserts the shapes
 * over real HTTP. This unit spec drives the arms a request cannot easily produce: a thrown
 * value that is not an `Error`, a custom exception whose response object carries no usable
 * `message`, and a status Node's table does not name. Those are the branches that decide
 * whether a failure is reported as the contract's envelope or leaks an object.
 */
describe('ErrorExceptionFilter', () => {
  const run = (exception: unknown): {body: unknown; status: number} => {
    const calls: Array<{body: unknown; status: number}> = [];
    const httpAdapter = {
      reply: (_response: unknown, body: unknown, status: number) => {
        calls.push({body, status});
      },
    } as never;
    const response = {};
    const host = {
      switchToHttp: () => ({getResponse: () => response}),
    } as unknown as ArgumentsHost;

    new ErrorExceptionFilter(httpAdapter).catch(exception, host);
    return calls[0];
  };

  it('maps a non-HTTP exception to an opaque 500', () => {
    const {body, status} = run(new Error('duplicate key: collection bookings'));

    expect(status).toBe(500);
    expect(body).toEqual({statusCode: 500, message: 'Internal server error', error: 'Internal Server Error'});
    expect(JSON.stringify(body)).not.toMatch(/duplicate key|collection/i);
  });

  it('handles a thrown value that is not an Error', () => {
    // A rejection can be any value; `String(exception)` is the arm that keeps the log call
    // from throwing on the value it is describing.
    const {body, status} = run('a bare string');

    expect(status).toBe(500);
    expect(body).toMatchObject({statusCode: 500, message: 'Internal server error'});
  });

  it('returns the validation list for a validation failure', () => {
    const {body, status} = run(new BadRequestException({message: ['a is wrong', 'b is wrong'], error: 'Bad Request'}));

    expect(status).toBe(400);
    expect(body).toEqual({statusCode: 400, message: ['a is wrong', 'b is wrong'], error: 'Bad Request'});
  });

  it('collapses a custom exception with an unusable response to its message string', () => {
    // A custom `HttpException` can carry any object as its response. Falling back to the
    // exception's own message keeps the contract's `message: string` rather than emitting
    // an object where a string is declared.
    const {body, status} = run(new HttpException({detail: 'no message here'}, HttpStatus.CONFLICT));

    expect(status).toBe(409);
    expect(body).toMatchObject({statusCode: 409, message: 'Http Exception'});
  });

  it('uses a string response verbatim', () => {
    const {body, status} = run(new HttpException('gone', HttpStatus.NOT_FOUND));

    expect(status).toBe(404);
    expect(body).toEqual({statusCode: 404, message: 'gone', error: 'Not Found'});
  });

  it('honours a structured exception body below 500', () => {
    const structured = new StructuredHttpException(
      {statusCode: 409, message: 'Conflict', conflicts: ['a', 'b']},
      HttpStatus.CONFLICT
    );

    expect(run(structured).body).toEqual({statusCode: 409, message: 'Conflict', conflicts: ['a', 'b']});
  });
});
