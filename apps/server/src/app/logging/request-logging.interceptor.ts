import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {Observable, throwError} from 'rxjs';
import {catchError, tap} from 'rxjs/operators';
import {Request, Response} from 'express';
import {StructuredLogger} from './structured-logger';
import {setActorId} from './request-context';

/**
 * Writes one record per request with the method, path, status and duration.
 *
 * A failing request is logged from the error path so its status is recorded
 * too; logging only on success would leave the failures — the ones worth
 * looking for — with no record. The status is taken from the exception rather
 * than the response, because the exception filter that sets the response
 * status has not run yet at this point.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // The guard has run by the time an interceptor executes, so an
    // authenticated caller is already on the request.
    const actor = (request as Request & {user?: {_id?: string}}).user;
    setActorId(actor?._id);

    const startedAt = process.hrtime.bigint();
    const elapsedMs = (): number => Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const base = {method: request.method, path: request.originalUrl ?? request.url};

    return next.handle().pipe(
      tap(() => {
        this.logger.log('request.completed', {
          ...base,
          status: response.statusCode,
          durationMs: Math.round(elapsedMs()),
        });
      }),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        this.logger.error('request.failed', {
          ...base,
          status,
          durationMs: Math.round(elapsedMs()),
          error: error instanceof Error ? error.message : String(error),
        });
        return throwError(() => error);
      }),
    );
  }
}
