import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the intra-booking overlap rule is handled on the routes a client reaches (T053, FR-012).
 *
 * The unit specs drive `findIntraBookingOverlap` and the service's warning in isolation.
 * What only an end-to-end request shows is that a booking whose own slots overlap is still
 * *accepted* — the legacy form warned rather than refused — and that a booking with adjacent
 * slots is accepted too, on both the create route and the booked-times replacement.
 */
describe('intra-booking overlap over HTTP', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};
  let token: string;

  const PASSWORD = 'correct horse battery';
  const DAY = '2026-03-04T00:00:00.000Z';

  const slot = (startHour: string, endHour: string) => ({
    day: DAY,
    startHours: startHour,
    endHours: endHour,
    status: 'INITIAL',
  });

  const createBody = (bookedTimes: unknown[]) => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala-sportowa', city: 'siechnice'},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes,
    paymentMethod: 'CASH',
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'admin@example.com',
      password: PASSWORD,
      role: 'ADMIN',
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email: 'admin@example.com', password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    token = ((await response.json()) as {token: string}).token;
  });

  const post = (body: unknown) =>
    fetch(`${ctx.baseUrl}/bookings`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  const put = (id: string, body: unknown) =>
    fetch(`${ctx.baseUrl}/bookings/${id}/booked-times`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  it('accepts a booking whose own slots overlap', async () => {
    // The issue's example: 13:00–15:00 and 14:00–16:00. The legacy form warned and let the
    // request through, so the server must store it rather than answer 422.
    const response = await post(
      createBody([
        slot('2026-03-04T13:00:00.000Z', '2026-03-04T15:00:00.000Z'),
        slot('2026-03-04T14:00:00.000Z', '2026-03-04T16:00:00.000Z'),
      ])
    );

    expect(response.status).toBe(201);
    const bookingModel = ctx.app.get(getModelToken('Booking')) as {countDocuments: () => Promise<number>};
    expect(await bookingModel.countDocuments()).toBe(1);
  });

  it('accepts a booking whose slots only touch', async () => {
    // `end == next start` is back-to-back, not an overlap.
    const response = await post(
      createBody([
        slot('2026-03-04T08:00:00.000Z', '2026-03-04T10:00:00.000Z'),
        slot('2026-03-04T10:00:00.000Z', '2026-03-04T12:00:00.000Z'),
      ])
    );

    expect(response.status).toBe(201);
  });

  it('accepts a replacement whose own slots overlap', async () => {
    const created = await post(createBody([slot('2026-03-04T08:00:00.000Z', '2026-03-04T09:00:00.000Z')]));
    expect(created.status).toBe(201);
    const {_id} = (await created.json()) as {_id: string};

    const response = await put(_id, [
      slot('2026-03-04T13:00:00.000Z', '2026-03-04T15:00:00.000Z'),
      slot('2026-03-04T14:00:00.000Z', '2026-03-04T16:00:00.000Z'),
    ]);

    expect(response.status).toBe(200);
  });
});
