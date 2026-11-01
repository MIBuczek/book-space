import {getConnectionToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {Connection} from 'mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * These run against the real `AppModule` on a real `mongod`, and assert on HTTP
 * responses rather than on the filter object. A unit test of the filter would
 * pass even if `configureApp` were never called from `main.ts` or the harness,
 * which is exactly the failure this is meant to catch: the pipe and filter are
 * only useful if the application that serves requests actually has them.
 */
describe('global validation and error handling', () => {
  let ctx: MongoTestContext;

  beforeAll(async () => {
    ctx = await createMongoTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  const post = (path: string, body: unknown) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });

  it('rejects an unknown property instead of passing it to the service', async () => {
    const res = await post('/auth/sign-in', {
      email: 'anna@example.com',
      password: 'secret1',
      role: 'ADMIN',
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message.join(' ')).toMatch(/role should not exist/);
  });

  it('returns the ValidationError shape from the contract', async () => {
    const res = await post('/auth/sign-in', {email: 'not-an-email', password: 'x'});
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toMatchObject({statusCode: 422, error: 'Unprocessable Entity'});
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message.every((m: unknown) => typeof m === 'string')).toBe(true);
  });

  it('returns the Error shape for a route that does not exist', async () => {
    const res = await fetch(`${ctx.baseUrl}/no-such-route`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({statusCode: 404, error: 'Not Found'});
    expect(typeof body.message).toBe('string');
  });

  it('does not leak database internals when a service throws an unknown error', async () => {
    // A malformed id makes Mongoose throw, and the service re-throws it as
    // `new HttpException(rawMessage, 500)` — so this exercises the real leak the
    // filter exists to close. The route is JWT-guarded, so the request needs a
    // real token; a 401 would pass this test without reaching the database at
    // all, which is how the first version of it was green while proving nothing.
    const connection = ctx.app.get<Connection>(getConnectionToken());
    const {insertedId} = await connection
      .collection('users')
      .insertOne({firstName: 'Anna', lastName: 'Kowalska', password: 'x'.repeat(60), email: 'leak@example.com'});
    const token = await ctx.app.get(JwtService).signAsync({email: 'leak@example.com', _id: insertedId.toString()});

    const res = await fetch(`${ctx.baseUrl}/bookings/not-an-objectid`, {
      headers: {authorization: `Bearer ${token}`},
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({statusCode: 500, message: 'Internal server error', error: 'Internal Server Error'});
    expect(JSON.stringify(body)).not.toMatch(/ObjectId|model|Mongoose|collection/i);
  });
});
