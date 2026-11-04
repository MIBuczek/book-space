import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves booking ownership is enforced over real HTTP, against the real `AppModule`,
 * a real MongoDB and a real signed JWT.
 *
 * The unit specs assert `canModifyBooking` and the controller's decision with a
 * stubbed service. What they cannot show is that the check runs against the stored
 * record and the *real* acting user: the user's `_id` on a request is a Mongoose
 * `ObjectId`, not the `string` the interface declares, so a comparison written for
 * strings would pass a unit test and deny every owner in production. Only an
 * end-to-end request catches that.
 */
describe('booking ownership over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {
    create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>;
    findById: (id: string) => Promise<{createdBy?: string} | null>;
  };
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};

  const PASSWORD = 'correct horse battery';

  const booking = (createdBy?: string) => ({
    type: 'INDIVIDUAL',
    place: {place: 'Hala', city: 'siechnice'},
    size: 'X/X',
    nick: 'Rezerwacja Kowalscy',
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
    accepted: false,
    archive: false,
    comments: 'Proszę o kontakt',
    paymentMethod: 'CASH',
    ...(createdBy === undefined ? {} : {createdBy}),
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

  /** Seeds a user and returns both the token and the id the booking will reference. */
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

  const update = (id: string, token: string, body: Record<string, unknown> = {comments: 'updated'}) =>
    fetch(`${ctx.baseUrl}/bookings/${id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  const remove = (id: string, token: string) =>
    fetch(`${ctx.baseUrl}/bookings/${id}`, {
      method: 'DELETE',
      headers: {authorization: `Bearer ${token}`},
    });

  /** A body that passes the global pipe's `BookingDto` validation. */
  const bookingRequest = () => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala', city: 'siechnice'},
    size: 'X/X',
    clientId: '123456789',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personCompany: '',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: '2026-03-04T10:00:00.000Z',
        startHours: '2026-03-04T10:00:00.000Z',
        endHours: '2026-03-04T11:00:00.000Z',
        status: 'INITIAL',
      },
    ],
    comments: '',
    paymentMethod: 'CASH',
  });

  it('stamps the creator on create and lets only them edit it', async () => {
    const {token, id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');

    const created = await fetch(`${ctx.baseUrl}/bookings`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(bookingRequest()),
    });

    expect(created.status).toBe(201);
    const record = (await created.json()) as {_id: string; createdBy?: string};
    // Stamped from the authenticated user, not the body, which does not carry it.
    expect(record.createdBy).toBe(ownerId);

    const {token: otherToken} = await signIn('other@example.com', 'EMPLOYEE');
    expect((await update(record._id, token)).status).toBe(200);
    expect((await update(record._id, otherToken)).status).toBe(403);
  });

  it('refuses an unauthenticated update', async () => {
    const {id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await fetch(`${ctx.baseUrl}/bookings/${String(stored._id)}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({accepted: true}),
    });

    expect(response.status).toBe(401);
  });

  it('lets a staff member update the booking they created', async () => {
    const {token, id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await update(String(stored._id), token);

    expect(response.status).toBe(200);
  });

  it('refuses a different staff member updating another staff member\'s booking', async () => {
    const {id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const {token: otherToken} = await signIn('other@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await update(String(stored._id), otherToken);

    expect(response.status).toBe(403);
  });

  it('refuses a different staff member deleting another staff member\'s booking', async () => {
    const {id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const {token: otherToken} = await signIn('other@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await remove(String(stored._id), otherToken);

    expect(response.status).toBe(403);
    // The record must still be there: a refused request that deleted anyway would be
    // worse than one that leaked an error.
    expect(await bookingModel.findById(String(stored._id))).not.toBeNull();
  });

  it('lets the owner delete the booking they created', async () => {
    const {token, id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await remove(String(stored._id), token);

    expect(response.status).toBe(200);
    expect(await bookingModel.findById(String(stored._id))).toBeNull();
  });

  it('lets an administrator update any booking', async () => {
    const {id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const {token: adminToken} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await update(String(stored._id), adminToken);

    expect(response.status).toBe(200);
  });

  it('lets an administrator delete any booking', async () => {
    const {id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const {token: adminToken} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await remove(String(stored._id), adminToken);

    expect(response.status).toBe(200);
  });

  it('does not treat a booking with no creator as owned by every staff member', async () => {
    const {token} = await signIn('owner@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(undefined));

    const response = await update(String(stored._id), token);

    // The legacy check was `''.includes('')`, which made an empty creator a match for
    // everyone. A missing identity is "no ownership".
    expect(response.status).toBe(403);
  });

  it('does not treat a creator whose id merely starts with the actor id as owned', async () => {
    const {token, id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    // `createdBy` has the actor's id as a prefix, which the legacy substring check
    // would have accepted.
    const stored = await bookingModel.create(booking(`${ownerId}-attacker`));

    const response = await update(String(stored._id), token);

    expect(response.status).toBe(403);
  });

  it('does not let an owner reassign the booking to someone else', async () => {
    const {token, id: ownerId} = await signIn('owner@example.com', 'EMPLOYEE');
    const {id: otherId} = await signIn('other@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking(ownerId));

    const response = await update(String(stored._id), token, {accepted: true, createdBy: otherId});

    expect(response.status).toBe(200);
    const after = await bookingModel.findById(String(stored._id));
    // The update body is a mapped type with no runtime validation, so the service is
    // what strips `createdBy`; without that, ownership would follow the caller's body.
    expect(after?.createdBy).toBe(ownerId);
  });

  it('answers 404 for a booking that does not exist', async () => {
    const {token} = await signIn('owner@example.com', 'EMPLOYEE');

    const response = await update('507f1f77bcf86cd799439011', token);

    expect(response.status).toBe(404);
  });
});
