import {INestApplication, ValidationPipe} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import {ErrorExceptionFilter} from './error-exception.filter';

/**
 * Applies the request-handling behaviour that must be identical in every
 * environment: strict validation of request payloads and a single error shape.
 *
 * This lives outside `main.ts` on purpose. Integration tests boot the real
 * `AppModule` through `createMongoTestContext`, which does not run `main.ts`; if
 * the pipe and filter were registered only in `main.ts`, every test would
 * exercise an application configured differently from the one that serves
 * traffic, and a regression that dropped them from `main.ts` would still pass.
 * Both entry points call this function instead.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties the DTO does not declare, and reject the request rather
      // than silently ignoring them. Without this a caller can set any schema
      // field the DTO omits (mass assignment), which is how `lastLogin` reached
      // `model.create()` from a request that never mentioned it.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {enableImplicitConversion: true},
      // The contract (contracts/openapi.yaml) declares 422 for validation
      // failures; Nest's ValidationPipe defaults to 400. The contract is the
      // specification the UI is written against, so the pipe is configured to
      // match it rather than the contract being changed to match the default.
      errorHttpStatusCode: 422,
    }),
  );

  // The filter needs the HTTP adapter to write a response for errors raised
  // outside the normal request pipeline. Reading it from the app rather than
  // importing a concrete adapter keeps this working under the test harness,
  // which uses the same Express adapter but a different server instance.
  const {httpAdapter} = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ErrorExceptionFilter(httpAdapter));
}
