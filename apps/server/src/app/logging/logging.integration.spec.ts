import {Controller, Get, HttpException, HttpStatus, INestApplication, Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {LoggingModule} from './logging.module';
import {StructuredLogger} from './structured-logger';
import {currentCorrelationId} from './request-context';

/**
 * Exercises the logging stack over a real HTTP round-trip: a real Nest
 * application, a real listener, a real request. The only substitution is the
 * logger transport, which is the extension point Nest provides and which lets
 * the emitted records be read back — the middleware, interceptor and redaction
 * under test are the ones used in production.
 */
@Controller('probe')
class ProbeController {
  constructor(private readonly logger: StructuredLogger) {}

  @Get('ok')
  ok(): {ok: true} {
    // Logs from inside the handler, the way a service would, to show the
    // correlation id reaches it without being passed as an argument.
    this.logger.log('probe.handled', {ambient: currentCorrelationId()});
    return {ok: true};
  }

  @Get('boom')
  boom(): never {
    throw new HttpException('probe failure', HttpStatus.CONFLICT);
  }

  @Get('leak')
  leak(): {ok: true} {
    this.logger.log('probe.leak', {password: 'hunter2', personEmail: 'anna@example.com'});
    return {ok: true};
  }
}

@Module({imports: [LoggingModule], controllers: [ProbeController]})
class ProbeModule {}

interface IRecord {
  message: string;
  correlationId?: string;
  [key: string]: unknown;
}

describe('request logging', () => {
  let app: INestApplication;
  let baseUrl: string;
  let records: IRecord[];
  let raw: string[];

  beforeAll(async () => {
    records = [];
    raw = [];

    // Nest also calls the logger with its own text during start-up, so a
    // message that is not one of our JSON records is kept aside rather than
    // parsed. Throwing here would abort the run before the assertion.
    const push = (message: unknown) => {
      const text = String(message);
      try {
        records.push(JSON.parse(text) as IRecord);
      } catch {
        raw.push(text);
      }
    };

    const capture = {
      log: push,
      error: push,
      warn: push,
      debug: () => undefined,
      verbose: () => undefined,
      fatal: push,
    };

    app = await NestFactory.create(ProbeModule, {logger: capture as never});
    // Bound to the IPv4 loopback explicitly: `getUrl()` otherwise reports the
    // IPv6 form, which is not reachable from the test runner.
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    records.length = 0;
    raw.length = 0;
  });

  it('starts up without a Nest error', () => {
    expect(raw.filter((line) => /error/i.test(line))).toEqual([]);
  });

  it('records one line per request with method, path, status and duration', async () => {
    const response = await fetch(`${baseUrl}/probe/ok`);
    await response.text();

    expect(response.status).toBe(200);

    const completed = records.find((record) => record.message === 'request.completed');
    expect(completed).toBeDefined();
    expect(completed?.method).toBe('GET');
    expect(completed?.path).toBe('/probe/ok');
    expect(completed?.status).toBe(200);
    expect(typeof completed?.durationMs).toBe('number');
  });

  it('returns the correlation id and uses it on the request log line', async () => {
    const response = await fetch(`${baseUrl}/probe/ok`);
    await response.text();

    const header = response.headers.get('x-request-id');
    expect(header).toBeTruthy();

    const completed = records.find((record) => record.message === 'request.completed');
    expect(completed?.correlationId).toBe(header);
  });

  it('makes the correlation id available inside the handler', async () => {
    const response = await fetch(`${baseUrl}/probe/ok`);
    await response.text();

    const handled = records.find((record) => record.message === 'probe.handled');
    expect(handled?.ambient).toBe(response.headers.get('x-request-id'));
  });

  it('reuses a well-formed caller-supplied correlation id', async () => {
    const response = await fetch(`${baseUrl}/probe/ok`, {
      headers: {'x-request-id': 'trace-abc-123'},
    });
    await response.text();

    expect(response.headers.get('x-request-id')).toBe('trace-abc-123');
  });

  it('replaces a caller-supplied id that is not a plain token', async () => {
    // `fetch` refuses to send a header value containing a newline, so the
    // middleware is driven directly here. A value like this is otherwise free
    // to carry a forged line into the log record.
    const {correlationIdMiddleware} = await import('./correlation-id.middleware');
    const request = {headers: {'x-request-id': 'bad id\ninjected'}} as never;
    const response = {setHeader: jest.fn()} as never;

    correlationIdMiddleware(request, response, () => undefined);

    const assigned = (request as {correlationId?: string}).correlationId;
    expect(assigned).toBeTruthy();
    expect(assigned).not.toContain('\n');
    expect(response).toBeDefined();
  });

  it('logs a failing request with its status so a failure is identifiable', async () => {
    const response = await fetch(`${baseUrl}/probe/boom`);
    await response.text();

    expect(response.status).toBe(409);

    const failed = records.find((record) => record.message === 'request.failed');
    expect(failed).toBeDefined();
    expect(failed?.path).toBe('/probe/boom');
    expect(failed?.status).toBe(409);
    expect(failed?.error).toBe('probe failure');
  });

  it('does not write a password or a personal e-mail into a log line', async () => {
    const response = await fetch(`${baseUrl}/probe/leak`);
    await response.text();

    const serialised = JSON.stringify(records);
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('anna@example.com');
  });
});
