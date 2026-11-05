import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the reporting routes over real HTTP, against the real `AppModule`, a real MongoDB
 * and a real signed JWT.
 *
 * The unit specs assert the aggregation, the CSV row shape and the deny-list. What they cannot
 * show is that the routes are guarded by the role and the deny-list, that the CSV response
 * carries its content type and BOM, and that the range rule is enforced through the real
 * global `ValidationPipe` — a hand-built `plainToInstance` would not reproduce the pipe's
 * 422 behaviour, which is what the malformed-month cases turn on.
 */
describe('reporting over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let clientModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
    clientModel = ctx.app.get(getModelToken('Client'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  const signIn = async (email: string, role: 'ADMIN' | 'EMPLOYEE' | 'OFFICE'): Promise<string> => {
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role,
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

  const createClient = async (overrides: Record<string, unknown> = {}) => {
    const created = (await clientModel.create({
      type: 'COMPANY',
      name: 'Klub Sportowy',
      contactPerson: 'Jan Kowalski',
      phone: '609996064',
      email: 'klub@example.com',
      street: 'ul. Sportowa 1',
      city: 'siechnice',
      zipCode: '55-010',
      nip: '1234567890',
      ...overrides,
    })) as {_id: {toString: () => string}};
    return created._id.toString();
  };

  const createBooking = (clientId: string, overrides: Record<string, unknown> = {}) =>
    bookingModel.create({
      type: 'COMPANY',
      place: {place: 'hala-sportowa', city: 'siechnice'},
      size: '1/2',
      nick: 'Klub Sportowy',
      personName: 'Jan Kowalski',
      personEmail: 'klub@example.com',
      personPhone: '609996064',
      month: 3,
      clientId,
      bookedTimes: [
        {
          day: new Date('2026-03-04T10:00:00Z'),
          startHours: new Date('2026-03-04T10:00:00Z'),
          endHours: new Date('2026-03-04T11:00:00Z'),
          status: 'DONE',
          participants: 10,
        },
      ],
      accepted: true,
      archive: false,
      paymentMethod: 'CASH',
      discount: '10%',
      extraOptions: false,
      selectedOptions: [],
      ...overrides,
    });

  const get = (path: string, token?: string) =>
    fetch(`${ctx.baseUrl}${path}`, {headers: token ? {authorization: `Bearer ${token}`} : {}});

  const range = 'fromMonth=2026-03-01&toMonth=2026-03-31';

  describe('GET /reporting/summary', () => {
    it('groups accepted bookings by city for an office user', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      await createBooking(clientId);
      await createBooking(clientId, {accepted: false});
      await createBooking(clientId, {place: {place: 'orlik', city: 'radwanice'}});

      const response = await get(`/reporting/summary?clientId=${clientId}&${range}`, token);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        client: {name: string};
        siechnice: unknown[];
        radwanice: unknown[];
      };
      expect(body.client.name).toBe('Klub Sportowy');
      expect(body.siechnice).toHaveLength(1);
      expect(body.radwanice).toHaveLength(1);
    });

    it('excludes a slot outside the requested month', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      await createBooking(clientId, {
        bookedTimes: [
          {
            day: new Date('2026-05-04T10:00:00Z'),
            startHours: new Date('2026-05-04T10:00:00Z'),
            endHours: new Date('2026-05-04T11:00:00Z'),
            status: 'INITIAL',
          },
        ],
      });

      const response = await get(`/reporting/summary?clientId=${clientId}&${range}`, token);
      const body = (await response.json()) as {siechnice: unknown[]};
      expect(body.siechnice).toHaveLength(0);
    });

    it('includes every accepted booking when fromTheBeginning is set', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      await createBooking(clientId, {
        bookedTimes: [
          {
            day: new Date('2020-05-04T10:00:00Z'),
            startHours: new Date('2020-05-04T10:00:00Z'),
            endHours: new Date('2020-05-04T11:00:00Z'),
            status: 'INITIAL',
          },
        ],
      });

      const response = await get(`/reporting/summary?clientId=${clientId}&fromTheBeginning=true`, token);
      const body = (await response.json()) as {siechnice: unknown[]};
      expect(body.siechnice).toHaveLength(1);
    });

    it('requires a period unless fromTheBeginning is set', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();

      const response = await get(`/reporting/summary?clientId=${clientId}`, token);
      expect(response.status).toBe(422);
    });

    it('refuses an employee', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');
      const clientId = await createClient();

      const response = await get(`/reporting/summary?clientId=${clientId}&${range}`, token);
      expect(response.status).toBe(403);
    });

    it('refuses an unauthenticated caller', async () => {
      const response = await get(`/reporting/summary?clientId=507f1f77bcf86cd799439011&${range}`);
      expect(response.status).toBe(401);
    });

    it('answers 404 for an unknown client', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const response = await get(`/reporting/summary?clientId=507f1f77bcf86cd799439011&${range}`, token);
      expect(response.status).toBe(404);
    });

    it('answers 422 for a malformed month', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      const response = await get(`/reporting/summary?clientId=${clientId}&fromMonth=nonsense&toMonth=2026-03-31`, token);
      expect(response.status).toBe(422);
    });
  });

  describe('GET /reporting/summary.csv', () => {
    it('exports one client as a semicolon-separated CSV with a BOM', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      await createBooking(clientId);

      const response = await get(`/reporting/summary.csv?clientId=${clientId}&${range}`, token);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      // Read the raw bytes rather than `text()`: the WHATWG UTF-8 decoder strips a leading
      // BOM, so `text()` would hide the very byte this asserts is present.
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(bytes.slice(3));
      const lines = text.split('\r\n');
      expect(lines[0]).toContain('Imie i nazwisko;Typ;');
      expect(lines[1]).toContain('Klub Sportowy');
      expect(lines[1]).toContain('Zakończona');
      expect(lines[1]).toContain('50%');
    });

    it('exports every client when clientId is omitted', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const first = await createClient({name: 'Klub A'});
      const second = await createClient({name: 'Klub B', email: 'b@example.com', nip: '9876543210'});
      await createBooking(first);
      await createBooking(second);

      const response = await get(`/reporting/summary.csv?${range}`, token);
      const text = await response.text();
      expect(text).toContain('Klub A');
      expect(text).toContain('Klub B');
    });

    it('refuses an employee', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');
      const response = await get(`/reporting/summary.csv?${range}`, token);
      expect(response.status).toBe(403);
    });
  });

  describe('the Summary deny-list (FR-006)', () => {
    it('refuses the legacy account on both routes', async () => {
      const token = await signIn('mkulakowski@umsiechnice.pl', 'ADMIN');
      const clientId = await createClient();

      const summary = await get(`/reporting/summary?clientId=${clientId}&${range}`, token);
      expect(summary.status).toBe(403);

      const csv = await get(`/reporting/summary.csv?${range}`, token);
      expect(csv.status).toBe(403);
    });

    it('permits another administrator', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const clientId = await createClient();
      const response = await get(`/reporting/summary?clientId=${clientId}&${range}`, token);
      expect(response.status).toBe(200);
    });
  });
});
