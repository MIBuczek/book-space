import {Global, MiddlewareConsumer, Module, NestModule} from '@nestjs/common';
import {APP_INTERCEPTOR} from '@nestjs/core';
import {StructuredLogger} from './structured-logger';
import {RequestLoggingInterceptor} from './request-logging.interceptor';
import {correlationIdMiddleware} from './correlation-id.middleware';

/**
 * Registered globally so every route is covered without each module opting in,
 * which is what makes "every request produces one log line" hold for a module
 * added later.
 */
@Global()
@Module({
  providers: [StructuredLogger, {provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor}],
  exports: [StructuredLogger],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(correlationIdMiddleware).forRoutes('*');
  }
}
