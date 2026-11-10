import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../testing/mongo-test-context';

/**
 * Proves the delete policies over real HTTP, against the real `AppModule`, a real MongoDB and
 * a real signed JWT (T059, FR-010, FR-024).
 *
 * The unit specs assert the reference counts and the `409`. What only a real database shows is
 * that the counts match the documents the schema actually stores — a booking references a
 * facility through the nested `place.place`/`place.city` pair and a client through `clientId`,
 * and a mock that answered `countDocuments` would pass whether or not the query matched a real
 * record. The public-read and booking-write cases are here for the same reason: they are the
 * referential-integrity half of the same policy, and a deactivated facility that still appears
 * in the calendar (or is still bookable) is the defect this task exists to close.
 */
describe('referential integrity over HTTP', () => {
  let ctx: MongoTestContext;
  // Structural types rather than the hydrated `Model<T>`: the spec uses `findById`/`create`,
  // whose hydrated overloads reject a plain `Record` fixture. The same reasoning as the
  // booking-indexes spec — declare the methods this file touches.
  let bookingModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let clientModel: {
    create: (doc: Record<string, unknown>) => Promise<{_id: {toString: () => string}}>;
    findById: (id: string) => Promise<{active?: boolean} | null>;
    findByIdAndDelete: (id: string) => Promise<unknown>;
  };
  let buildingModel: {create: (doc: Record<string, unknown>) => Promise<{_id: {toString: () => string}}>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
    clientModel = ctx.app.get(getModelToken('Client'));
    buildingModel = ctx.app.get(getModelToken('Building'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  const signIn = async (email: string, role: 'ADMIN' | 'OFFICE'): Promise<string> => {
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

  const createClient = async (overrides: Record<string, unknown> = {}): Promise<string> => {
    const created = await clientModel.create({
      type: 'INDIVIDUAL',
      name: 'Jan Kowalski',
      contactPerson: 'Jan Kowalski',
      phone: '609996064',
      email: 'jan@example.com',
      street: 'ul. Sportowa 1',
      city: 'siechnice',
      zipCode: '55-010',
      ...overrides,
    });
    return created._id.toString();
  };

  const createFacility = async (overrides: Record<string, unknown> = {}): Promise<string> => {
    const created = await buildingModel.create({
      name: 'Hala sportowa',
      property: 'hala-sportowa',
      city: 'siechnice',
      sizes: ['1/1', '1/2'],
      email: 'siechnice.hala@gmail.com',
      phone: '609996064',
      lighting: false,
      toilets: false,
      employees: [],
      ...overrides,
    });
    return created._id.toString();
  };

  const createBooking = (overrides: Record<string, unknown> = {}) =>
    bookingModel.create({
      type: 'INDIVIDUAL',
      place: {place: 'hala-sportowa', city: 'siechnice'},
      size: '1/2',
      nick: 'Rezerwacja Kowalscy',
      personName: 'Jan Kowalski',
      personEmail: 'jan@example.com',
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
      paymentMethod: 'CASH',
      ...overrides,
    });

  const remove = (path: string, token: string) =>
    fetch(`${ctx.baseUrl}${path}`, {method: 'DELETE', headers: {authorization: `Bearer ${token}`}});

  describe('DELETE /clients/{_id}', () => {
    it('refuses with 409 when a booking still references the client', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const clientId = await createClient();
      await createBooking({clientId});

      const response = await remove(`/clients/${clientId}`, token);

      expect(response.status).toBe(409);
      // The client survives: a refused delete must not remove the record.
      const stored = await clientModel.findById(clientId);
      expect(stored).not.toBeNull();
    });

    it('deletes the client when no booking references it', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const clientId = await createClient();

      const response = await remove(`/clients/${clientId}`, token);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({deletedCount: 1});
    });

    it('deactivates a referenced client through the update route instead', async () => {
      // The supported way to retire a client a booking references.
      const token = await signIn('admin@example.com', 'ADMIN');
      const clientId = await createClient();
      await createBooking({clientId});

      const response = await fetch(`${ctx.baseUrl}/clients/${clientId}`, {
        method: 'PUT',
        headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
        body: JSON.stringify({active: false}),
      });

      expect(response.status).toBe(200);
      const stored = await clientModel.findById(clientId);
      expect(stored?.active).toBe(false);
    });
  });

  describe('DELETE /buildings/{_id}', () => {
    it('refuses with 409 when a booking references the facility', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const facilityId = await createFacility();
      await createBooking({place: {place: 'hala-sportowa', city: 'siechnice'}});

      const response = await remove(`/buildings/${facilityId}`, token);

      expect(response.status).toBe(409);
    });

    it('refuses with 409 when a staff user is assigned to the facility', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const facilityId = await createFacility();
      await userModel.create({
        firstName: 'Jan',
        lastName: 'Nowak',
        email: 'office@example.com',
        password: PASSWORD,
        role: 'OFFICE',
        city: 'siechnice',
        buildings: ['hala-sportowa'],
        active: true,
      });

      const response = await remove(`/buildings/${facilityId}`, token);

      expect(response.status).toBe(409);
    });

    it('deletes the facility when nothing references it', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const facilityId = await createFacility();

      const response = await remove(`/buildings/${facilityId}`, token);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({deletedCount: 1});
    });
  });

  describe('a deactivated facility', () => {
    it('is withheld from the public GET /buildings read', async () => {
      await createFacility({property: 'active-hall', active: true});
      await createFacility({property: 'retired-hall', active: false});

      const response = await fetch(`${ctx.baseUrl}/buildings`);
      const body = (await response.json()) as Array<{property: string}>;

      expect(response.status).toBe(200);
      expect(body.map((b) => b.property)).toEqual(['active-hall']);
    });

    it('is still returned to a staff caller, so it stays visible and editable', async () => {
      // The Facilities tab shows the record and the Users tab offers it for assignment; the
      // staff read has to carry it or a retired facility would simply vanish from the admin
      // area. Reactivation is `PUT /buildings/{_id} {active: true}`.
      const token = await signIn('office@example.com', 'OFFICE');
      await createFacility({property: 'retired-hall', active: false});

      const response = await fetch(`${ctx.baseUrl}/buildings`, {
        headers: {authorization: `Bearer ${token}`},
      });
      const body = (await response.json()) as Array<{property: string; active?: boolean}>;

      expect(response.status).toBe(200);
      expect(body.map((b) => b.property)).toEqual(['retired-hall']);
      expect(body[0].active).toBe(false);
    });

    it('is refused on POST /bookings with 422', async () => {
      await createFacility({property: 'retired-hall', active: false});

      const response = await fetch(`${ctx.baseUrl}/bookings`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          type: 'INDIVIDUAL',
          place: {place: 'retired-hall', city: 'siechnice'},
          size: '1/1',
          nick: 'Rezerwacja Kowalscy',
          personName: 'Jan Kowalski',
          personEmail: 'jan@example.com',
          personPhone: '609996064',
          month: 3,
          paymentMethod: 'CASH',
          rodoAcknowledgement: true,
          bookedTimes: [
            {
              day: '2026-03-04T10:00:00.000Z',
              startHours: '2026-03-04T10:00:00.000Z',
              endHours: '2026-03-04T11:00:00.000Z',
              status: 'INITIAL',
            },
          ],
        }),
      });

      expect(response.status).toBe(422);
      expect(await response.text()).toContain('no longer available');
    });
  });

  describe('summary behaviour for a booking whose client no longer exists', () => {
    it('omits the orphaned booking from the combined CSV, which is why the delete is refused', async () => {
      // This is the defect the policy closes: the legacy delete removed the client and left
      // the booking's `clientId` dangling, and because the combined export iterates stored
      // clients, the orphaned booking then vanished from the report. The delete is refused so
      // this state cannot arise through the API; the case pins what it would look like.
      const token = await signIn('office@example.com', 'OFFICE');
      const clientId = await createClient();
      await createBooking({clientId, accepted: true, place: {place: 'hala-sportowa', city: 'siechnice'}});

      // Simulate the orphan directly (the API refuses to create it): remove the client and
      // leave the booking pointing at the gone id.
      await clientModel.findByIdAndDelete(clientId);

      const response = await fetch(
        `${ctx.baseUrl}/reporting/summary.csv?fromMonth=2026-03-01&toMonth=2026-03-31`,
        {headers: {authorization: `Bearer ${token}`}}
      );

      expect(response.status).toBe(200);
      const csv = await response.text();
      // The orphaned booking's client is gone, so no row names it.
      expect(csv).not.toContain('Jan Kowalski');
    });
  });
});
