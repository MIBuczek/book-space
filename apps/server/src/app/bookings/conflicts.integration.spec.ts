import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves `GET /bookings/conflicts` over real HTTP, against the real `AppModule`, a
 * real MongoDB and a real signed JWT.
 *
 * The unit specs pin the rules and the query filter with stubs. What they cannot show
 * is that the route is reachable at all: `conflicts` is a literal segment declared
 * before `@Get(':_id')`, so an ordering mistake would route it to the single-booking
 * handler and answer `500` on the cast instead. The role guard and the query
 * validation are likewise only exercised end to end.
 */
describe('GET /bookings/conflicts over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';
  const CITY = 'siechnice';
  const BUILDING = 'hala';

  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: BUILDING, city: CITY},
    size: 'X/X',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: new Date('2026-03-04T00:00:00Z'),
        startHours: new Date('2026-03-04T08:00:00Z'),
        endHours: new Date('2026-03-04T10:00:00Z'),
        status: 'INITIAL',
      },
    ],
    accepted: false,
    archive: false,
    comments: 'Proszę o kontakt',
    paymentMethod: 'CASH',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  const signIn = async (email: string, role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE'): Promise<string> => {
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role,
      city: role === 'ADMIN' ? undefined : CITY,
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as {token: string}).token;
  };

  const getConflicts = (token: string | undefined, query = `city=${CITY}&building=${BUILDING}&month=3`) =>
    fetch(`${ctx.baseUrl}/bookings/conflicts?${query}`, {
      headers: token ? {authorization: `Bearer ${token}`} : {},
    });

  it('returns the ids of the conflicting unaccepted bookings to an administrator', async () => {
    const first = await bookingModel.create(booking());
    const second = await bookingModel.create(
      booking({
        bookedTimes: [
          {
            day: new Date('2026-03-04T00:00:00Z'),
            startHours: new Date('2026-03-04T09:00:00Z'),
            endHours: new Date('2026-03-04T11:00:00Z'),
            status: 'INITIAL',
          },
        ],
      })
    );
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token);

    expect(response.status).toBe(200);
    const ids = (await response.json()) as string[];
    expect(ids.sort()).toEqual([String(first._id), String(second._id)].sort());
  });

  it('does not return a non-overlapping booking', async () => {
    await bookingModel.create(booking());
    await bookingModel.create(
      booking({
        bookedTimes: [
          {
            day: new Date('2026-03-05T00:00:00Z'),
            startHours: new Date('2026-03-05T08:00:00Z'),
            endHours: new Date('2026-03-05T10:00:00Z'),
            status: 'INITIAL',
          },
        ],
      })
    );
    const token = await signIn('admin@example.com', 'ADMIN');

    const ids = (await (await getConflicts(token)).json()) as string[];

    expect(ids).toEqual([]);
  });

  it('does not compare bookings in a different month', async () => {
    await bookingModel.create(booking({month: 4}));
    await bookingModel.create(booking({month: 4}));
    const token = await signIn('admin@example.com', 'ADMIN');

    // The two April bookings overlap each other, but the query asks for March.
    const ids = (await (await getConflicts(token)).json()) as string[];

    expect(ids).toEqual([]);
  });

  it('refuses an employee with 403', async () => {
    const token = await signIn('employee@example.com', 'EMPLOYEE');

    const response = await getConflicts(token);

    expect(response.status).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    const response = await getConflicts(undefined);

    expect(response.status).toBe(401);
  });

  it('rejects a missing month with 422', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token, `city=${CITY}&building=${BUILDING}`);

    // The contract declares 422 for validation failures; the global pipe is configured
    // to match it rather than Nest's default 400.
    expect(response.status).toBe(422);
  });

  it('rejects an out-of-range month with 422', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token, `city=${CITY}&building=${BUILDING}&month=12`);

    expect(response.status).toBe(422);
  });
});
