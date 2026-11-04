import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the booked-time rules T011 added are attached to the routes a client reaches,
 * over real HTTP (FR-012).
 *
 * The DTO and schema specs drive `validate`/`validateSync` directly. What only an
 * end-to-end request shows is that the global pipe runs the nested `BookedTimeDto` on the
 * create path — before this the field had no `@ValidateNested`, so nothing inside the
 * array was checked — that `ParseArrayPipe` runs it on the replacement route, and that a
 * wire value arrives as the ISO string a client sends and is converted before the
 * cross-field comparison runs.
 */
describe('booked-time validation over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};

  const PASSWORD = 'correct horse battery';

  /** A slot as the wire sees it: ISO strings, which the pipe converts to Dates. */
  const slot = (overrides: Record<string, unknown> = {}) => ({
    day: '2026-03-04T00:00:00.000Z',
    startHours: '2026-03-04T08:00:00.000Z',
    endHours: '2026-03-04T10:00:00.000Z',
    status: 'INITIAL',
    ...overrides,
  });

  /** A stored booking, so the replacement route has a record to act on. */
  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala', city: 'siechnice'},
    size: 'X/X',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: new Date('2026-03-04T00:00:00.000Z'),
        startHours: new Date('2026-03-04T08:00:00.000Z'),
        endHours: new Date('2026-03-04T10:00:00.000Z'),
        status: 'INITIAL',
      },
    ],
    accepted: false,
    archive: false,
    paymentMethod: 'CASH',
    ...overrides,
  });

  /** A create body that is valid apart from whatever the caller overrides. */
  const createBody = (bookedTimes: unknown) => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala', city: 'siechnice'},
    size: 'X/X',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes,
    accepted: false,
    archive: false,
    paymentMethod: 'CASH',
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

  const signIn = async (email: string, role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE'): Promise<{token: string; id: string}> => {
    const user = await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role,
      city: role === 'ADMIN' ? undefined : 'siechnice',
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    return {token: ((await response.json()) as {token: string}).token, id: String(user._id)};
  };

  const replaceSlots = (id: string, body: unknown, token: string) =>
    fetch(`${ctx.baseUrl}/bookings/${id}/booked-times`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  const createBooking = (body: unknown, token: string) =>
    fetch(`${ctx.baseUrl}/bookings`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  describe('PUT /bookings/{_id}/booked-times', () => {
    it('rejects an end before the start with 422', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');
      const stored = await bookingModel.create(booking());

      const response = await replaceSlots(
        String(stored._id),
        [slot({startHours: '2026-03-04T10:00:00.000Z', endHours: '2026-03-04T08:00:00.000Z'})],
        token
      );

      expect(response.status).toBe(422);
    });

    it('rejects an end equal to the start with 422', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');
      const stored = await bookingModel.create(booking());

      const response = await replaceSlots(
        String(stored._id),
        [slot({startHours: '2026-03-04T08:00:00.000Z', endHours: '2026-03-04T08:00:00.000Z'})],
        token
      );

      expect(response.status).toBe(422);
    });

    it('rejects a non-numeric participant with 422', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');
      const stored = await bookingModel.create(booking());

      const response = await replaceSlots(String(stored._id), [slot({participants: 'ten'})], token);

      expect(response.status).toBe(422);
    });

    it('rejects a participant above 50 with 422', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');
      const stored = await bookingModel.create(booking());

      const response = await replaceSlots(String(stored._id), [slot({participants: 51})], token);

      expect(response.status).toBe(422);
    });

    it('accepts a valid interval', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');
      const stored = await bookingModel.create(booking());

      const response = await replaceSlots(String(stored._id), [slot({participants: 10})], token);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /bookings', () => {
    it('rejects an inverted interval in the create body with 422', async () => {
      // The crafted payload the issue names reaches the API here. Before the nested
      // validation was attached, `bookedTimes` items were never checked on this route.
      const {token} = await signIn('admin@example.com', 'ADMIN');

      const response = await createBooking(
        createBody([slot({startHours: '2026-03-04T10:00:00.000Z', endHours: '2026-03-04T08:00:00.000Z'})]),
        token
      );

      expect(response.status).toBe(422);
    });

    it('rejects a non-numeric participant in the create body with 422', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');

      const response = await createBooking(createBody([slot({participants: 'ten'})]), token);

      expect(response.status).toBe(422);
    });

    it('accepts a valid create body', async () => {
      const {token} = await signIn('admin@example.com', 'ADMIN');

      const response = await createBooking(createBody([slot()]), token);

      expect(response.status).toBe(201);
    });
  });
});
