import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * The abuse protection on the two public write routes, over real HTTP (T057, FR-048–FR-050).
 *
 * The unit specs cover the store, the guard and the quota service in isolation. What only an
 * end-to-end request shows is that the guards are *attached* to the routes a caller reaches and
 * that the refusal is a `429` on the wire — a green unit run looks the same whether the guard is
 * wired to the controller or merely defined.
 *
 * The limits are set small here, and set *before* `createMongoTestContext` because
 * `ConfigModule.forRoot` captures the environment when `AppModule` is first imported. Every
 * other suite gets the harness's generous defaults, so this is the one place the limits are
 * actually exercised.
 */
describe('public endpoint abuse protection over HTTP', () => {
  let ctx: MongoTestContext;

  let mailServer: Server;

  const RATE_LIMIT = 5;
  const QUOTA = 1;

  beforeAll(async () => {
    mailServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end('{}');
    });
    await new Promise<void>((resolve) => mailServer.listen(0, '127.0.0.1', resolve));
    const {port} = mailServer.address() as AddressInfo;

    // Set before `AppModule` is imported, so the config and the guard read them.
    process.env.PUBLIC_RATE_LIMIT = String(RATE_LIMIT);
    process.env.PUBLIC_RATE_LIMIT_WINDOW_MS = '600000';
    process.env.NOTIFICATION_QUOTA = String(QUOTA);
    process.env.MAIL_ENDPOINT = `http://127.0.0.1:${port}/send`;
    process.env.MAIL_FROM = 'bookings@example.com';
    process.env.TENANT_STAFF_EMAIL = 'biuro@example.com';

    ctx = await createMongoTestContext();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    await new Promise<void>((resolve) => mailServer.close(() => resolve()));

    // Jest reuses a worker process across spec files, and `process.env` is process-wide, so
    // the small limits set above would otherwise leak into every later file in this worker —
    // which `createMongoTestContext`'s `?? default` would then preserve rather than override.
    delete process.env.PUBLIC_RATE_LIMIT;
    delete process.env.PUBLIC_RATE_LIMIT_WINDOW_MS;
    delete process.env.NOTIFICATION_QUOTA;
    delete process.env.MAIL_ENDPOINT;
    delete process.env.MAIL_FROM;
    delete process.env.TENANT_STAFF_EMAIL;
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });

  /** A valid public booking body: the size rule is skipped for a facility that does not exist. */
  const bookingBody = () => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala', city: 'siechnice'},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: '2026-03-04T00:00:00.000Z',
        startHours: '2026-03-04T08:00:00.000Z',
        endHours: '2026-03-04T10:00:00.000Z',
        status: 'INITIAL',
      },
    ],
    paymentMethod: 'CASH',
    rodoAcknowledgement: true,
  });

  it('answers 429 past the per-IP rate limit on POST /bookings (FR-048)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < RATE_LIMIT + 1; i += 1) {
      statuses.push((await post('/bookings', bookingBody())).status);
    }

    expect(statuses.slice(0, RATE_LIMIT).every((s) => s === 201)).toBe(true);
    expect(statuses[RATE_LIMIT]).toBe(429);
  });

  it('carries a retryAfterSeconds hint on the 429', async () => {
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      await post('/bookings', bookingBody());
    }

    const response = await post('/bookings', bookingBody());
    expect(response.status).toBe(429);
    const body = (await response.json()) as {retryAfterSeconds?: number};
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('answers 429 past the per-recipient outbound quota on POST /notifications/message (FR-050)', async () => {
    const message = {person: 'Anna Nowak', email: 'anna@example.com', message: 'Proszę o kontakt'};

    const first = await post('/notifications/message', message);
    expect(first.status).toBe(202);

    const second = await post('/notifications/message', message);
    expect(second.status).toBe(429);
  });

  it('refuses a booking that filled the honeypot field with 422 (FR-049)', async () => {
    const response = await post('/bookings', {...bookingBody(), website: 'http://spam.example'});
    expect(response.status).toBe(422);
  });
});
