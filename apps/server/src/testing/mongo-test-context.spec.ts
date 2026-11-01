import {createMongoTestContext, MongoTestContext} from './mongo-test-context';

/**
 * Proves the harness boots the real `AppModule` against a real `mongod` and that
 * `reset()` isolates tests. If this fails, every integration test built on it is
 * meaningless, so it is deliberately the first thing the harness delivers.
 */
describe('MongoTestContext', () => {
  let ctx: MongoTestContext;

  beforeAll(async () => {
    ctx = await createMongoTestContext();
  }, 120_000);

  afterAll(async () => {
    await ctx.close();
  });

  // Isolates every test. Without this the suite would pass or fail depending on
  // execution order, which is the defect the harness exists to prevent.
  beforeEach(async () => {
    await ctx.reset();
  });

  it('boots the application and serves the root route', async () => {
    const res = await fetch(ctx.baseUrl);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({message: 'Hello API'});
  });

  it('connects to a real database', async () => {
    const {getConnectionToken} = await import('@nestjs/mongoose');
    const connection = ctx.app.get(getConnectionToken());

    expect(connection.readyState).toBe(1);
    const ping = await connection.db.admin().ping();
    expect(ping.ok).toBe(1);
  });

  it('writes and reads back through the real Mongoose model', async () => {
    const {getModelToken} = await import('@nestjs/mongoose');
    const model = ctx.app.get(getModelToken('User'));

    await model.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'hashed-placeholder',
    });

    const found = await model.findOne({email: 'ada@example.com'});
    expect(found.firstName).toBe('Ada');
  });

  it('reset() clears state so the next test starts empty', async () => {
    const {getModelToken} = await import('@nestjs/mongoose');
    const model = ctx.app.get(getModelToken('User'));

    expect(await model.countDocuments()).toBe(0);
  });
});
