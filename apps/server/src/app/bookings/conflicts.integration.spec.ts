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

  const MARCH = 'from=2026-03-01&to=2026-03-31';

  const getConflicts = (token: string | undefined, query = `city=${CITY}&building=${BUILDING}&${MARCH}`) =>
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

  it('does not compare bookings whose slots fall outside the period', async () => {
    // The two bookings overlap each other, but on a day the query's period excludes.
    const april = {
      bookedTimes: [
        {
          day: new Date('2026-04-04T00:00:00Z'),
          startHours: new Date('2026-04-04T08:00:00Z'),
          endHours: new Date('2026-04-04T10:00:00Z'),
          status: 'INITIAL',
        },
      ],
    };
    await bookingModel.create(booking(april));
    await bookingModel.create(booking(april));
    const token = await signIn('admin@example.com', 'ADMIN');

    const ids = (await (await getConflicts(token)).json()) as string[];

    expect(ids).toEqual([]);
  });

  it('finds a conflict across a month boundary when the slots share a day', async () => {
    // T054. The crossing booking's scalar `month` is derived from its first slot
    // (September), so a scope keyed on the scalar would never load it for an October
    // query — the blind spot the issue names. The scope is the slot days, so both are
    // reported.
    const crossing = await bookingModel.create(
      booking({
        month: 8,
        bookedTimes: [
          {
            day: new Date('2026-09-30T00:00:00Z'),
            startHours: new Date('2026-09-30T08:00:00Z'),
            endHours: new Date('2026-09-30T09:00:00Z'),
            status: 'INITIAL',
          },
          {
            day: new Date('2026-10-02T00:00:00Z'),
            startHours: new Date('2026-10-02T08:00:00Z'),
            endHours: new Date('2026-10-02T09:00:00Z'),
            status: 'INITIAL',
          },
        ],
      })
    );
    const october = await bookingModel.create(
      booking({
        month: 9,
        bookedTimes: [
          {
            day: new Date('2026-10-02T00:00:00Z'),
            startHours: new Date('2026-10-02T08:30:00Z'),
            endHours: new Date('2026-10-02T09:30:00Z'),
            status: 'INITIAL',
          },
        ],
      })
    );
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token, `city=${CITY}&building=${BUILDING}&from=2026-10-01&to=2026-10-31`);

    expect(response.status).toBe(200);
    const ids = (await response.json()) as string[];
    expect(ids.sort()).toEqual([String(crossing._id), String(october._id)].sort());
  });

  it('refuses an employee with 403', async () => {
    const token = await signIn('employee@example.com', 'EMPLOYEE');

    const response = await getConflicts(token);

    expect(response.status).toBe(403);
  });

  it('refuses an office user with 403', async () => {
    // The conflict counter is administrator-only (matrix row "See the conflict counter"),
    // so the office role is refused as well as the employee.
    const token = await signIn('office@example.com', 'OFFICE');

    const response = await getConflicts(token);

    expect(response.status).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    const response = await getConflicts(undefined);

    expect(response.status).toBe(401);
  });

  it('rejects a missing period with 422', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token, `city=${CITY}&building=${BUILDING}`);

    // The contract declares 422 for validation failures; the global pipe is configured
    // to match it rather than Nest's default 400.
    expect(response.status).toBe(422);
  });

  it('rejects an unparsable period with 422', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await getConflicts(token, `city=${CITY}&building=${BUILDING}&from=not-a-date&to=2026-03-31`);

    expect(response.status).toBe(422);
  });
});
