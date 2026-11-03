import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the resolved-slot rule over real HTTP, against the real `AppModule`, a real
 * MongoDB and a real signed JWT (FR-018).
 *
 * The pure rule has its own spec and the service is covered with stubs. What only an
 * end-to-end request can show is that the rule is attached to the route a client actually
 * reaches, that the array body is validated by `ParseArrayPipe` at all (the global pipe
 * declines an `Array` metatype, so before this route was changed nothing in the body was
 * checked), that the ownership check runs on the slot route too, and that a refused
 * replacement leaves the stored record byte-for-byte unchanged.
 */
describe('resolved slot immutability over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {
    create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>;
    findById: (id: string) => Promise<{bookedTimes: Array<{status: string; day: Date; startHours: Date; endHours: Date; comments?: string}>; modifiedBy?: string} | null>;
  };
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};

  const PASSWORD = 'correct horse battery';
  const CITY = 'siechnice';
  const BUILDING = 'hala';
  const DAY = '2026-03-04T00:00:00.000Z';
  const OTHER_DAY = '2026-03-05T00:00:00.000Z';

  /** A slot as the wire sees it: ISO strings, which the pipe converts to Dates. */
  const slot = (overrides: Record<string, unknown> = {}) => ({
    day: DAY,
    startHours: '2026-03-04T08:00:00.000Z',
    endHours: '2026-03-04T10:00:00.000Z',
    status: 'INITIAL',
    ...overrides,
  });

  /**
   * A slot as it is stored. `bookedTimes` is an untyped `Array` in the booking schema, so
   * Mongoose writes what it is given: seeding with ISO strings would store strings where
   * production stores `Date`s, and the rule reads stored slots by instant.
   */
  const storedSlot = (overrides: Record<string, unknown> = {}) => ({
    day: new Date(DAY),
    startHours: new Date('2026-03-04T08:00:00.000Z'),
    endHours: new Date('2026-03-04T10:00:00.000Z'),
    status: 'INITIAL',
    ...overrides,
  });

  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: BUILDING, city: CITY},
    size: 'X/X',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [storedSlot()],
    accepted: true,
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

  const signIn = async (
    email: string,
    role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE'
  ): Promise<{token: string; id: string}> => {
    const user = await userModel.create({
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
    return {token: ((await response.json()) as {token: string}).token, id: String(user._id)};
  };

  const replaceSlots = (id: string, body: unknown, token?: string) =>
    fetch(`${ctx.baseUrl}/bookings/${id}/booked-times`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify(body),
    });

  it('refuses removing a resolved slot and leaves the record unchanged', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'DONE', participants: 4})]}));

    const response = await replaceSlots(String(stored._id), [], token);

    expect(response.status).toBe(409);
    const body = (await response.json()) as {statusCode: number; message: string};
    expect(body.statusCode).toBe(409);
    expect(body.message).toBe('Nie można skasować pola które zostało rozliczone');

    const after = await bookingModel.findById(String(stored._id));
    expect(after?.bookedTimes).toHaveLength(1);
    expect(after?.bookedTimes[0].status).toBe('DONE');
  });

  it('refuses editing the hours of a resolved slot', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'DONE'})]}));

    const response = await replaceSlots(
      String(stored._id),
      [slot({status: 'DONE', endHours: '2026-03-04T11:00:00.000Z'})],
      token
    );

    expect(response.status).toBe(409);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes[0].endHours.toISOString()).toBe(
      '2026-03-04T10:00:00.000Z'
    );
  });

  it('refuses moving a resolved slot to another day', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'DONE'})]}));

    const response = await replaceSlots(String(stored._id), [slot({status: 'DONE', day: OTHER_DAY})], token);

    // The old day is gone from the list, which is a removal of the resolved slot.
    expect(response.status).toBe(409);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes[0].day.toISOString()).toBe(DAY);
  });

  it('refuses reverting a resolved slot to INITIAL', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'CANCELED'})]}));

    const response = await replaceSlots(String(stored._id), [slot({status: 'INITIAL'})], token);

    expect(response.status).toBe(409);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes[0].status).toBe('CANCELED');
  });

  it('refuses changing a resolved slot comment', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'DONE', comments: 'pierwszy'})]}));

    const response = await replaceSlots(String(stored._id), [slot({status: 'DONE', comments: 'drugi'})], token);

    expect(response.status).toBe(409);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes[0].comments).toBe('pierwszy');
  });

  it('preserves a resolved slot when the replacement carries it unchanged', async () => {
    const {token, id: adminId} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot({status: 'DONE', participants: 4})]}));

    const response = await replaceSlots(
      String(stored._id),
      [slot({status: 'DONE', participants: 4}), slot({day: OTHER_DAY})],
      token
    );

    expect(response.status).toBe(200);
    const after = await bookingModel.findById(String(stored._id));
    expect(after?.bookedTimes).toHaveLength(2);
    expect(after?.bookedTimes[0].status).toBe('DONE');
    expect(after?.modifiedBy).toBe(adminId);
  });

  it('edits and removes an INITIAL slot freely', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await replaceSlots(
      String(stored._id),
      [slot({startHours: '2026-03-04T09:00:00.000Z', endHours: '2026-03-04T12:00:00.000Z'})],
      token
    );

    expect(response.status).toBe(200);
    const after = await bookingModel.findById(String(stored._id));
    expect(after?.bookedTimes[0].startHours.toISOString()).toBe('2026-03-04T09:00:00.000Z');
  });

  it('removes an INITIAL slot freely', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({bookedTimes: [storedSlot(), storedSlot({day: new Date(OTHER_DAY)})]}));

    const response = await replaceSlots(String(stored._id), [slot({day: OTHER_DAY})], token);

    expect(response.status).toBe(200);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes).toHaveLength(1);
  });

  it('refuses a different staff member with 403 and does not write', async () => {
    const owner = await signIn('owner@example.com', 'EMPLOYEE');
    const {token} = await signIn('other@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking({createdBy: owner.id}));

    const response = await replaceSlots(String(stored._id), [slot({status: 'DONE'})], token);

    expect(response.status).toBe(403);
    expect((await bookingModel.findById(String(stored._id)))?.bookedTimes[0].status).toBe('INITIAL');
  });

  it('lets the owner replace the slots of their own booking', async () => {
    const owner = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking({createdBy: owner.id}));

    const response = await replaceSlots(String(stored._id), [slot()], owner.token);

    expect(response.status).toBe(200);
  });

  it('refuses an anonymous caller with 401', async () => {
    const stored = await bookingModel.create(booking());

    const response = await replaceSlots(String(stored._id), [slot()]);

    expect(response.status).toBe(401);
  });

  it('rejects an unknown slot property with 422', async () => {
    // The array body is validated by `ParseArrayPipe`; the global pipe alone would not
    // see it. Without that pipe this request would be accepted.
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await replaceSlots(String(stored._id), [slot({_id: '507f1f77bcf86cd799439011'})], token);

    expect(response.status).toBe(422);
  });

  it('rejects a slot without a day with 422', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await replaceSlots(String(stored._id), [{startHours: '2026-03-04T08:00:00.000Z', endHours: '2026-03-04T10:00:00.000Z', status: 'INITIAL'}], token);

    expect(response.status).toBe(422);
  });

  it('rejects a body that is not an array with 422', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await replaceSlots(String(stored._id), slot(), token);

    expect(response.status).toBe(422);
  });

  it('answers 404 for a booking that does not exist', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');

    const response = await replaceSlots('507f1f77bcf86cd799439011', [slot()], token);

    expect(response.status).toBe(404);
  });

  it('does not let the generic update route change the slots', async () => {
    // The generic `PUT /bookings/{_id}` takes a `BookingDto` body, which declares
    // `bookedTimes`. Without the strip in `updateBooking`, an owner could replace the slot
    // list there and skip the FR-018 check — the rule would exist on one route and be
    // absent on the other that writes the same field.
    const owner = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(
      booking({createdBy: owner.id, bookedTimes: [storedSlot({status: 'DONE'})]})
    );

    const response = await fetch(`${ctx.baseUrl}/bookings/${String(stored._id)}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${owner.token}`},
      body: JSON.stringify({bookedTimes: [], comments: 'trying to clear the settled slot'}),
    });

    expect(response.status).toBe(200);
    const after = await bookingModel.findById(String(stored._id));
    expect(after?.bookedTimes).toHaveLength(1);
    expect(after?.bookedTimes[0].status).toBe('DONE');
  });
});
