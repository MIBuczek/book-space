import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the approval and archive routes over real HTTP, against the real `AppModule`,
 * a real MongoDB and a real signed JWT.
 *
 * The unit specs pin the conflict rule and the controller's decision with stubs. What
 * they cannot show is that the structured `409` reaches the client intact — the global
 * exception filter narrows every error to `{statusCode, message, error}`, so a `409`
 * that has to carry the conflicting ids is a property of the filter and the service
 * together, and only an end-to-end request exercises both. The role split and the
 * `modifiedBy` audit stamp are likewise only real against a stored record.
 */
describe('booking approval and archive over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {
    create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>;
    findById: (id: string) => Promise<{accepted?: boolean; archive?: boolean; modifiedBy?: string; modifiedAt?: Date} | null>;
  };
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};

  const PASSWORD = 'correct horse battery';
  const CITY = 'siechnice';
  const BUILDING = 'hala';
  const DAY = new Date('2026-03-04T00:00:00Z');

  const slot = (start: string, end: string) => ({
    day: DAY,
    startHours: new Date(start),
    endHours: new Date(end),
    status: 'INITIAL',
  });

  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: BUILDING, city: CITY},
    size: 'X/X',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [slot('2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')],
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

  const approve = (id: string, body: Record<string, unknown>, token?: string) =>
    fetch(`${ctx.baseUrl}/bookings/${id}/approve`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify(body),
    });

  const archive = (id: string, body: Record<string, unknown>, token?: string) =>
    fetch(`${ctx.baseUrl}/bookings/${id}/archive`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify(body),
    });

  /** A second booking that overlaps the first on the same day and facility. */
  const conflicting = (overrides: Record<string, unknown> = {}) =>
    booking({bookedTimes: [slot('2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')], ...overrides});

  it('approves an unconflicted booking and records the actor', async () => {
    const {token, id: adminId} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {booking: {accepted: boolean}; conflicts: string[]};
    expect(body.booking.accepted).toBe(true);
    expect(body.conflicts).toEqual([]);

    const after = await bookingModel.findById(String(stored._id));
    expect(after?.accepted).toBe(true);
    expect(after?.modifiedBy).toBe(adminId);
    expect(after?.modifiedAt).toBeInstanceOf(Date);
  });

  it('refuses an approval that would keep a conflict, and names the conflicting booking', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());
    const other = await bookingModel.create(conflicting());

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(409);
    const body = (await response.json()) as {statusCode: number; conflicts: string[]};
    expect(body.statusCode).toBe(409);
    expect(body.conflicts).toEqual([String(other._id)]);

    // A refused approval must not have been written.
    expect((await bookingModel.findById(String(stored._id)))?.accepted).toBe(false);
  });

  it('treats an already-approved booking as a conflict', async () => {
    // The counter (`GET /bookings/conflicts`) excludes accepted bookings; approval must
    // not, because an approved booking is exactly the one that cannot be double-booked.
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());
    await bookingModel.create(conflicting({accepted: true}));

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(409);
  });

  it('does not report a booking on a different day as a conflict', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());
    // Same facility, a month later: the day differs, so there is nothing to compare. The
    // stored `month` is not the scope (T054) — the day is.
    await bookingModel.create(
      booking({
        month: 4,
        bookedTimes: [
          {
            day: new Date('2026-04-04T00:00:00Z'),
            startHours: new Date('2026-04-04T09:00:00Z'),
            endHours: new Date('2026-04-04T11:00:00Z'),
            status: 'INITIAL',
          },
        ],
      })
    );

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(200);
  });

  it('reports a conflict across a month boundary, scoping by the slot days', async () => {
    // T054. The target's slots straddle the boundary (its scalar `month` is September,
    // from the first slot). The candidate query is scoped to the target's own slot days,
    // so the October booking on 2 Oct is loaded and reported — a scope keyed on the
    // scalar would miss it.
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(
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
    const other = await bookingModel.create(
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

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(409);
    const body = (await response.json()) as {conflicts: string[]};
    expect(body.conflicts).toEqual([String(other._id)]);
  });

  it('approves despite a conflict when force is set, and still reports it', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());
    const other = await bookingModel.create(conflicting());

    const response = await approve(String(stored._id), {accepted: true, force: true}, token);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {booking: {accepted: boolean}; conflicts: string[]};
    expect(body.booking.accepted).toBe(true);
    expect(body.conflicts).toEqual([String(other._id)]);
  });

  it('unapproves a conflicted booking without a conflict check', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking({accepted: true}));
    await bookingModel.create(conflicting());

    const response = await approve(String(stored._id), {accepted: false}, token);

    expect(response.status).toBe(200);
    expect((await bookingModel.findById(String(stored._id)))?.accepted).toBe(false);
  });

  it('refuses an employee with 403', async () => {
    const {token} = await signIn('employee@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking());

    const response = await approve(String(stored._id), {accepted: true}, token);

    expect(response.status).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    const stored = await bookingModel.create(booking());

    const response = await approve(String(stored._id), {accepted: true});

    expect(response.status).toBe(401);
  });

  it('rejects a missing accepted field with 422', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await approve(String(stored._id), {}, token);

    expect(response.status).toBe(422);
  });

  it('rejects an unknown property with 422', async () => {
    // The body is a concrete DTO, so the global pipe's `forbidNonWhitelisted` sees it.
    // A `Partial<...>` body would be erased to `Object` and this would pass through.
    const {token} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await approve(String(stored._id), {accepted: true, archive: true}, token);

    expect(response.status).toBe(422);
  });

  it('answers 404 for a booking that does not exist', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');

    const response = await approve('507f1f77bcf86cd799439011', {accepted: true}, token);

    expect(response.status).toBe(404);
  });

  it('archives a booking and records the actor', async () => {
    const {token, id: adminId} = await signIn('admin@example.com', 'ADMIN');
    const stored = await bookingModel.create(booking());

    const response = await archive(String(stored._id), {archive: true}, token);

    expect(response.status).toBe(200);
    const after = await bookingModel.findById(String(stored._id));
    expect(after?.archive).toBe(true);
    expect(after?.modifiedBy).toBe(adminId);
  });

  it('refuses an employee archiving with 403', async () => {
    const {token} = await signIn('employee@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking());

    const response = await archive(String(stored._id), {archive: true}, token);

    expect(response.status).toBe(403);
  });

  it('refuses an anonymous archive with 401', async () => {
    const stored = await bookingModel.create(booking());

    const response = await archive(String(stored._id), {archive: true});

    expect(response.status).toBe(401);
  });

  it('answers 404 for archiving a booking that does not exist', async () => {
    const {token} = await signIn('admin@example.com', 'ADMIN');

    const response = await archive('507f1f77bcf86cd799439011', {archive: true}, token);

    expect(response.status).toBe(404);
  });

  it('does not let the generic update route approve a booking', async () => {
    // The generic `PUT /bookings/{_id}` still receives a `BookingDto` body, which
    // declares `accepted` and `archive`. Without the strip in `updateBooking`, an
    // owner could set `accepted` there and skip the conflict check entirely — the
    // approval rule would exist on one route and be absent on the other that writes
    // the same field.
    const {token, id: ownerId} = await signIn('employee@example.com', 'EMPLOYEE');
    const stored = await bookingModel.create(booking({createdBy: ownerId}));

    const response = await fetch(`${ctx.baseUrl}/bookings/${String(stored._id)}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify({accepted: true, comments: 'trying to self-approve'}),
    });

    expect(response.status).toBe(200);
    expect((await bookingModel.findById(String(stored._id)))?.accepted).toBe(false);
  });
});
