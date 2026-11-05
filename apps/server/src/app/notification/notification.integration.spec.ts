import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';
import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the notification routes over real HTTP, against the real `AppModule`, a real MongoDB
 * and a real local mail server.
 *
 * The mail provider is a real HTTP server rather than a stub: the properties under test — the
 * recipient is resolved server-side, a provider failure is a `502` and leaves the booking
 * untouched (FR-036), the contact form is public while a booking notification is staff-only —
 * are only visible when a real request is made through the real transport the module installs.
 */
describe('notifications over HTTP', () => {
  let ctx: MongoTestContext;
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<unknown>; findById: (id: string) => Promise<unknown>};
  let buildingModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  let mailServer: Server;
  let mailEndpoint: string;
  let sent: Array<Record<string, unknown>>;
  let mailStatus = 200;

  const PASSWORD = 'correct horse battery';

  beforeAll(async () => {
    sent = [];
    mailServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        sent.push(JSON.parse(raw) as Record<string, unknown>);
        res.writeHead(mailStatus, {'content-type': 'application/json'});
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => mailServer.listen(0, '127.0.0.1', resolve));
    const {port} = mailServer.address() as AddressInfo;
    mailEndpoint = `http://127.0.0.1:${port}/send`;

    // Set before `AppModule` is imported, because `ConfigModule.forRoot` and the transport
    // factory read these at boot.
    process.env.MAIL_ENDPOINT = mailEndpoint;
    process.env.MAIL_FROM = 'bookings@example.com';
    process.env.SISK_CONTACT_EMAIL = 'biuro@example.com';

    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
    buildingModel = ctx.app.get(getModelToken('Building'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    await new Promise<void>((resolve) => mailServer.close(() => resolve()));
  });

  beforeEach(async () => {
    await ctx.reset();
    sent.length = 0;
    mailStatus = 200;
  });

  const signIn = async (email: string, role: 'ADMIN' | 'EMPLOYEE' | 'OFFICE'): Promise<string> => {
    await userModel.create({firstName: 'Ada', lastName: 'Lovelace', email, password: PASSWORD, role, active: true});
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as {token: string}).token;
  };

  const createFacility = (overrides: Record<string, unknown> = {}) =>
    buildingModel.create({
      name: 'Hala Sportowa',
      property: 'hala-sportowa',
      email: 'facility@example.com',
      phone: '111222333',
      city: 'siechnice',
      sizes: ['1/1', '1/2'],
      ...overrides,
    });

  const createBooking = async (overrides: Record<string, unknown> = {}) => {
    const created = (await bookingModel.create({
      type: 'COMPANY',
      place: {place: 'hala-sportowa', city: 'siechnice'},
      size: '1/2',
      nick: 'Klub Sportowy',
      personName: 'Jan Kowalski',
      personCompany: 'Klub Sportowy',
      personEmail: 'klub@example.com',
      personPhone: '609996064',
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
      paymentMethod: 'TRANSFER',
      extraOptions: false,
      selectedOptions: [],
      ...overrides,
    })) as {_id: {toString: () => string}};
    return created._id.toString();
  };

  const post = (path: string, body: Record<string, unknown>, token?: string) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify(body),
    });

  describe('POST /notifications/booking', () => {
    it('sends to the facility address resolved from the booking, for an office user', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      await createFacility();
      const bookingId = await createBooking();

      const response = await post('/notifications/booking', {bookingId, audience: 'FACILITY'}, token);

      expect(response.status).toBe(202);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('facility@example.com');
      expect(String(sent[0].text)).toContain('Jan Kowalski');
    });

    it('sends to the SISK inbox for the staff audience', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const bookingId = await createBooking();

      const response = await post('/notifications/booking', {bookingId, audience: 'STAFF'}, token);

      expect(response.status).toBe(202);
      expect(sent[0].to).toBe('biuro@example.com');
    });

    it('refuses an employee', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');
      await createFacility();
      const bookingId = await createBooking();

      const response = await post('/notifications/booking', {bookingId, audience: 'FACILITY'}, token);
      expect(response.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('refuses an unauthenticated caller', async () => {
      const bookingId = await createBooking();
      const response = await post('/notifications/booking', {bookingId, audience: 'FACILITY'});
      expect(response.status).toBe(401);
    });

    it('answers 422 for an unknown audience', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const bookingId = await createBooking();
      const response = await post('/notifications/booking', {bookingId, audience: 'EVERYONE'}, token);
      expect(response.status).toBe(422);
    });

    it('answers 404 for an unknown booking', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      const response = await post('/notifications/booking', {bookingId: '507f1f77bcf86cd799439011', audience: 'STAFF'}, token);
      expect(response.status).toBe(404);
    });

    it('answers 502 on a provider failure and leaves the booking untouched (FR-036)', async () => {
      const token = await signIn('office@example.com', 'OFFICE');
      await createFacility();
      const bookingId = await createBooking({accepted: true});
      mailStatus = 500;

      const response = await post('/notifications/booking', {bookingId, audience: 'FACILITY'}, token);

      expect(response.status).toBe(502);
      // The booking is still there and unchanged: the failure did not roll anything back.
      const stored = (await bookingModel.findById(bookingId)) as {accepted: boolean} | null;
      expect(stored).not.toBeNull();
      expect(stored?.accepted).toBe(true);
    });
  });

  describe('POST /notifications/message', () => {
    it('delivers a public contact-form message to the SISK inbox', async () => {
      const response = await post('/notifications/message', {
        person: 'Anna Nowak',
        email: 'anna@example.com',
        message: 'Proszę o kontakt',
      });

      expect(response.status).toBe(202);
      expect(sent[0].to).toBe('biuro@example.com');
      expect(String(sent[0].text)).toContain('Anna Nowak');
      expect(String(sent[0].text)).toContain('Proszę o kontakt');
    });

    it('delivers a message to a selected facility employee', async () => {
      const response = await post('/notifications/message', {
        person: 'Anna Nowak',
        email: 'anna@example.com',
        message: 'Pytanie',
        recipient: 'employee@example.com',
      });

      expect(response.status).toBe(202);
      expect(sent[0].to).toBe('employee@example.com');
    });

    it('answers 422 for a malformed sender address', async () => {
      const response = await post('/notifications/message', {
        person: 'Anna Nowak',
        email: 'not-an-email',
        message: 'Pytanie',
      });
      expect(response.status).toBe(422);
    });
  });
});
