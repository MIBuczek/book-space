import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the public calendar is restricted over real HTTP, against the real
 * `AppModule`, a real MongoDB and a real signed JWT.
 *
 * The unit specs already assert the query filter and the redaction list. What they
 * cannot show is that the two are attached to the route a public caller actually
 * reaches, that the filter survives a real Mongoose query rather than a mocked
 * `find`, and that the redaction happens to the object Nest serialises — a stub
 * would pass whether or not the controller returned the serialised form.
 */
describe('public booking read path', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: 'Hala', city: 'siechnice'},
    size: 'X/X',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [{day: new Date('2026-03-04T10:00:00Z'), startHours: new Date('2026-03-04T10:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z'), status: 'INITIAL'}],
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

  // The public calendar must name a period (T022). The helper supplies a wide one so the
  // specs that are about redaction are not also about the range rule.
  const PUBLIC_PERIOD = 'from=2020-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z';

  const getBookings = (token?: string, query = PUBLIC_PERIOD) =>
    fetch(`${ctx.baseUrl}/bookings?${query}`, {
      headers: token ? {authorization: `Bearer ${token}`} : {},
    });

  const signIn = async (email: string, role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE'): Promise<string> => {
    await userModel.create({
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
    return ((await response.json()) as {token: string}).token;
  };

  it('serves an anonymous caller without a credential', async () => {
    await bookingModel.create(booking());

    const response = await getBookings();

    expect(response.status).toBe(200);
  });

  it('hides an unaccepted booking from an anonymous caller', async () => {
    await bookingModel.create(booking({accepted: false}));

    const body = (await (await getBookings()).json()) as {items: Array<Record<string, unknown>>};

    expect(body.items).toEqual([]);
  });

  it('hides an archived booking from an anonymous caller', async () => {
    await bookingModel.create(booking({archive: true}));

    const body = (await (await getBookings()).json()) as {items: Array<Record<string, unknown>>};

    expect(body.items).toEqual([]);
  });

  it('refuses an anonymous read with no period', async () => {
    await bookingModel.create(booking());

    const response = await fetch(`${ctx.baseUrl}/bookings`);

    // The unbounded read is what exposed the whole history; the contract answers 422.
    expect(response.status).toBe(422);
  });

  it('does not put the tenant personal data in the anonymous body at all', async () => {
    await bookingModel.create(booking());

    const text = await (await getBookings()).text();

    // Asserted against the raw text, not the parsed object: a field that is present
    // but undefined still travels, and `toHaveProperty` would not see it.
    expect(text).not.toContain('Jan Kowalski');
    expect(text).not.toContain('jan@example.com');
    expect(text).not.toContain('500100200');
    expect(text).not.toContain('Proszę o kontakt');
  });

  it('keeps the fields the calendar renders', async () => {
    await bookingModel.create(booking());

    const {items} = (await (await getBookings()).json()) as {items: Array<Record<string, unknown>>};
    const [first] = items;

    expect(first).toMatchObject({
        size: 'X/X',
      month: 3,
      accepted: true,
      archive: false,
      paymentMethod: 'CASH',
    });
    expect(first.place).toEqual({place: 'Hala', city: 'siechnice'});
  });

  it('serves the full record to an employee', async () => {
    await bookingModel.create(booking({accepted: false}));
    const token = await signIn('employee@example.com', 'EMPLOYEE');

    const {items} = (await (await getBookings(token)).json()) as {items: Array<Record<string, unknown>>};

    // The unfiltered read is what the matrix gives staff, so the unaccepted booking
    // is present and carries its personal fields.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({personName: 'Jan Kowalski', personEmail: 'jan@example.com'});
  });

  it('serves the full record to an administrator', async () => {
    await bookingModel.create(booking({archive: true}));
    const token = await signIn('admin@example.com', 'ADMIN');

    // The archived record is only in scope when the caller asks for the archive; the
    // default list is non-archived for staff as well, matching the legacy read.
    const {items} = (await (
      await getBookings(token, `${PUBLIC_PERIOD}&archive=true`)
    ).json()) as {items: Array<Record<string, unknown>>};

    expect(items).toHaveLength(1);
    expect(items[0]).toHaveProperty('personPhone', '500100200');
  });

  it('refuses an invalid token rather than answering as anonymous', async () => {
    await bookingModel.create(booking());

    const response = await fetch(`${ctx.baseUrl}/bookings`, {
      headers: {authorization: 'Bearer not-a-real-token'},
    });

    // A silently redacted calendar would leave a caller whose session expired
    // believing they were signed in, looking at incomplete data.
    expect(response.status).toBe(401);
  });

  it('refuses a token whose account was deactivated', async () => {
    await bookingModel.create(booking());
    const token = await signIn('employee@example.com', 'EMPLOYEE');
    const {MongoClient} = await import('mongodb');
    const os = await import('os');
    const client = new MongoClient(ctx.uri, {runtimeAdapters: {os}});
    await client.connect();
    await client.db('book_space').collection('users').updateOne({email: 'employee@example.com'}, {$set: {active: false}});
    await client.close();

    const response = await getBookings(token);

    expect(response.status).toBe(401);
  });

  it('does not redact the record for an employee who also fails the role check', async () => {
    // Guard against the opposite mistake: the restricted shape must not be applied
    // to staff, or the calendar would lose the details the office needs.
    await bookingModel.create(booking({accepted: false}));
    const token = await signIn('office@example.com', 'OFFICE');

    const text = await (await getBookings(token)).text();

    expect(text).toContain('jan@example.com');
  });
});
