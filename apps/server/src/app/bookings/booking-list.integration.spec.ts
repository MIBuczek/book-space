import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the booking-list filters and pagination over real HTTP, against the real
 * `AppModule`, a real MongoDB and a real signed JWT (FR-020, FR-022, FR-043, issue #26).
 *
 * The pure resolver has its own spec and the service is covered with stubs. What only an
 * end-to-end request can show is that the filters are attached to the route a client
 * reaches, that they survive a real Mongoose query (a `place.city` filter against the
 * nested object, a `createdAt` range), that the envelope's `total` is the pre-pagination
 * count, and that an anonymous caller is refused when it names no period.
 */
describe('booking list filters and pagination over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};

  const PASSWORD = 'correct horse battery';
  const CITY = 'siechnice';

  /**
   * A booking created at a chosen instant. `createdAt` is seeded rather than left to the
   * default so the period assertions are exact; it is `immutable` on updates, not on
   * insert, so `create` writes it.
   */
  const booking = (createdAt: string, overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: 'Hala', city: CITY},
    size: 'X/X',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: new Date('2026-03-04T10:00:00Z'),
        startHours: new Date('2026-03-04T10:00:00Z'),
        endHours: new Date('2026-03-04T11:00:00Z'),
        status: 'INITIAL',
      },
    ],
    accepted: true,
    archive: false,
    paymentMethod: 'CASH',
    createdAt: new Date(createdAt),
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

  const list = (query: string, token?: string) =>
    fetch(`${ctx.baseUrl}/bookings?${query}`, {
      headers: token ? {authorization: `Bearer ${token}`} : {},
    });

  const pageOf = async (query: string, token?: string) =>
    (await (await list(query, token)).json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      limit: number;
    };

  const WIDE = 'from=2020-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z';

  describe('period filter', () => {
    it('includes a booking created inside the range and excludes one outside it', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z'));
      await bookingModel.create(booking('2027-01-15T12:00:00.000Z'));

      const {items, total} = await pageOf('from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z');

      expect(total).toBe(1);
      expect(items).toHaveLength(1);
    });

    it('treats the bounds as inclusive', async () => {
      await bookingModel.create(booking('2026-08-01T00:00:00.000Z'));
      await bookingModel.create(booking('2026-08-31T23:59:59.999Z'));

      const {total} = await pageOf('from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z');

      expect(total).toBe(2);
    });
  });

  describe('field filters', () => {
    it('filters by city and building', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {place: {place: 'Hala', city: CITY}}));
      await bookingModel.create(booking('2026-08-16T12:00:00.000Z', {place: {place: 'Hala', city: 'radwanice'}}));

      const {items, total} = await pageOf(`${WIDE}&city=${CITY}&building=Hala`);

      expect(total).toBe(1);
      expect(items[0].place).toMatchObject({city: CITY, place: 'Hala'});
    });

    it('filters by accepted', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {accepted: true}));
      await bookingModel.create(booking('2026-08-16T12:00:00.000Z', {accepted: false}));
      const token = await signIn('admin@example.com', 'ADMIN');

      const {items, total} = await pageOf(`${WIDE}&accepted=false`, token);

      expect(total).toBe(1);
      expect(items[0].accepted).toBe(false);
    });

    it('defaults the archive filter to false', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {archive: false}));
      await bookingModel.create(booking('2026-08-16T12:00:00.000Z', {archive: true}));
      const token = await signIn('admin@example.com', 'ADMIN');

      const {total} = await pageOf(WIDE, token);

      expect(total).toBe(1);
    });

    it('returns the archived records only when asked for them', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {archive: false}));
      await bookingModel.create(booking('2026-08-16T12:00:00.000Z', {archive: true}));
      const token = await signIn('admin@example.com', 'ADMIN');

      const {items, total} = await pageOf(`${WIDE}&archive=true`, token);

      expect(total).toBe(1);
      expect(items[0].archive).toBe(true);
    });

    it('filters by clientId', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {clientId: 'client-a'}));
      await bookingModel.create(booking('2026-08-16T12:00:00.000Z', {clientId: 'client-b'}));
      const token = await signIn('admin@example.com', 'ADMIN');

      const {items, total} = await pageOf(`${WIDE}&clientId=client-a`, token);

      expect(total).toBe(1);
      expect(items[0].clientId).toBe('client-a');
    });

    it('ignores the accepted and archive flags for a public caller', async () => {
      // FR-005 is a rule, not a default the public can override. An unaccepted booking
      // must stay hidden even when the caller asks for it explicitly.
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z', {accepted: false}));

      const {total} = await pageOf(`${WIDE}&accepted=false`);

      expect(total).toBe(0);
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let day = 1; day <= 5; day += 1) {
        await bookingModel.create(booking(`2026-08-0${day}T12:00:00.000Z`));
      }
    });

    it('reports the total before pagination and slices the page', async () => {
      const first = await pageOf(`${WIDE}&page=1&limit=2`);

      expect(first.total).toBe(5);
      expect(first.items).toHaveLength(2);
      expect(first.page).toBe(1);
      expect(first.limit).toBe(2);
    });

    it('returns the next slice on the next page', async () => {
      const first = await pageOf(`${WIDE}&page=1&limit=2`);
      const second = await pageOf(`${WIDE}&page=2&limit=2`);

      const firstIds = first.items.map((b) => String(b._id));
      const secondIds = second.items.map((b) => String(b._id));
      expect(second.items).toHaveLength(2);
      expect(firstIds).not.toEqual(secondIds);
      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    });

    it('returns the remaining records on the last page', async () => {
      const last = await pageOf(`${WIDE}&page=3&limit=2`);

      expect(last.items).toHaveLength(1);
    });

    it('returns an empty page past the end without changing the total', async () => {
      const beyond = await pageOf(`${WIDE}&page=9&limit=2`);

      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(5);
    });

    it('defaults to 50 per page', async () => {
      const first = await pageOf(WIDE);

      expect(first.limit).toBe(50);
      expect(first.items).toHaveLength(5);
    });
  });

  describe('the period rule for anonymous callers', () => {
    it('refuses an anonymous read with no period', async () => {
      const response = await list('');

      expect(response.status).toBe(422);
    });

    it('refuses an anonymous read with only one bound', async () => {
      const response = await list('from=2026-08-01T00:00:00.000Z');

      expect(response.status).toBe(422);
    });

    it('serves an anonymous read that names a period', async () => {
      await bookingModel.create(booking('2026-08-15T12:00:00.000Z'));

      const response = await list(WIDE);

      expect(response.status).toBe(200);
    });
  });

  describe('the all-records option', () => {
    it('lets an administrator skip the academic-year default', async () => {
      // Created two years before "now", so the academic-year default would exclude it.
      await bookingModel.create(booking('2020-03-15T12:00:00.000Z'));
      const token = await signIn('admin@example.com', 'ADMIN');

      const withDefault = await pageOf('', token);
      const withAll = await pageOf('all=true', token);

      expect(withDefault.total).toBe(0);
      expect(withAll.total).toBe(1);
    });

    it('refuses a non-administrator who asks for every record', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      const response = await list('all=true', token);

      expect(response.status).toBe(403);
    });
  });
});
