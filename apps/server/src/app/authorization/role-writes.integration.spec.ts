import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the client and facility role rules over real HTTP, against the real `AppModule`,
 * a real MongoDB and a real signed JWT (T025, authorization matrix rows "Read clients",
 * "Create/update/delete clients", "Read facilities and employees" and
 * "Create/update/delete facilities").
 *
 * Integration rather than a unit test of `RolesGuard`: the guard was already covered, and
 * what a stubbed guard cannot show is whether `@Roles` is *attached* to each route. A
 * controller that lost its decorator would still pass a unit test with the guard mocked
 * out, so every case here goes through a genuine token and the real guard stack.
 */
describe('client and facility role rules', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  const CLIENT = {
    type: 'INDIVIDUAL',
    name: 'Jan Kowalski',
    contactPerson: 'Jan Kowalski',
    phone: '609996064',
    email: 'jan@example.com',
    street: 'ul. Sportowa 1',
    city: 'siechnice',
    zipCode: '55-010',
  };

  const FACILITY = {
    name: 'Nowa hala',
    property: 'nowa-hala',
    email: 'hala@example.com',
    phone: '609996064',
    city: 'siechnice',
    sizes: ['1/1'],
  };

  beforeAll(async () => {
    ctx = await createMongoTestContext();
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

  const request = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : {'content-type': 'application/json'}),
        ...(token ? {authorization: `Bearer ${token}`} : {}),
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });

  describe('clients', () => {
    it('refuses an unauthenticated caller with 401', async () => {
      expect((await request('GET', '/clients')).status).toBe(401);
    });

    it('refuses an employee read with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('GET', '/clients', token)).status).toBe(403);
    });

    it('lets an office user read', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('GET', '/clients', token)).status).toBe(200);
    });

    it('lets an administrator read', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      expect((await request('GET', '/clients', token)).status).toBe(200);
    });

    it('refuses an unauthenticated single read with 401', async () => {
      expect((await request('GET', '/clients/507f1f77bcf86cd799439011')).status).toBe(401);
    });

    it('lets an office user read a single client', async () => {
      // The class-level `@Roles('OFFICE','ADMIN')` covers the single read as well as the
      // list, so this is the success half of the row rather than a second list assertion.
      const admin = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/clients', admin, CLIENT);
      const {_id} = (await created.json()) as {_id: string};
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('GET', `/clients/${_id}`, token)).status).toBe(200);
    });

    it('lets an administrator read a single client', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/clients', token, CLIENT);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('GET', `/clients/${_id}`, token)).status).toBe(200);
    });

    it('refuses an unauthenticated write with 401', async () => {
      // The route-level `@Roles('ADMIN')` on the writes does not replace the class-level
      // `AuthGuard('jwt')`, so an absent credential is a 401 rather than a 403 — the same
      // "authentication before authorisation" order the users spec pins.
      const id = '507f1f77bcf86cd799439011';
      const responses = await Promise.all([
        request('POST', '/clients', undefined, CLIENT),
        request('PUT', `/clients/${id}`, undefined, {nick: 'X'}),
        request('DELETE', `/clients/${id}`),
      ]);

      expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
    });

    it('lets an administrator update', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/clients', token, CLIENT);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('PUT', `/clients/${_id}`, token, {nick: 'Nowy nick'})).status).toBe(200);
    });

    it('refuses an employee create with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('POST', '/clients', token, CLIENT)).status).toBe(403);
    });

    it('refuses an office create with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('POST', '/clients', token, CLIENT)).status).toBe(403);
    });

    it('lets an administrator create', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      expect((await request('POST', '/clients', token, CLIENT)).status).toBe(201);
    });

    it('refuses an office update with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      const response = await request('PUT', '/clients/507f1f77bcf86cd799439011', token, {nick: 'X'});

      expect(response.status).toBe(403);
    });

    it('refuses an office delete with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('DELETE', '/clients/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });

    it('refuses an employee delete with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('DELETE', '/clients/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });

    it('lets an administrator delete', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      expect((await request('DELETE', '/clients/507f1f77bcf86cd799439011', token)).status).toBe(200);
    });
  });

  describe('facilities', () => {
    // The list is public (T034): the calendar's city/facility selectors and the booking
    // form's size options need it, and FR-007 says the facilities are exposed to the UI.
    // The anonymous caller gets a redacted record; the contact details and the employee
    // list stay staff-only. The single read below is still 401.
    it('serves the list to an unauthenticated caller with 200', async () => {
      expect((await request('GET', '/buildings')).status).toBe(200);
    });

    it('lets an employee read', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('GET', '/buildings', token)).status).toBe(200);
    });

    it('lets an office user read', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('GET', '/buildings', token)).status).toBe(200);
    });

    it('refuses an employee create with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('POST', '/buildings', token, FACILITY)).status).toBe(403);
    });

    it('refuses an office create with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('POST', '/buildings', token, FACILITY)).status).toBe(403);
    });

    it('lets an administrator create', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      expect((await request('POST', '/buildings', token, FACILITY)).status).toBe(201);
    });

    it('lets each staff role read a single facility', async () => {
      // The single read is `@Roles('EMPLOYEE','OFFICE','ADMIN')` while the list is public,
      // so the staff half of that row is proved here rather than by the list cases above.
      const admin = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/buildings', admin, FACILITY);
      const {_id} = (await created.json()) as {_id: string};
      const employee = await signIn('employee@example.com', 'EMPLOYEE');
      const office = await signIn('office@example.com', 'OFFICE');

      const responses = await Promise.all([
        request('GET', `/buildings/${_id}`, employee),
        request('GET', `/buildings/${_id}`, office),
        request('GET', `/buildings/${_id}`, admin),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    });

    it('refuses an unauthenticated write with 401', async () => {
      const id = '507f1f77bcf86cd799439011';
      const responses = await Promise.all([
        request('POST', '/buildings', undefined, FACILITY),
        request('PUT', `/buildings/${id}`, undefined, {name: 'X'}),
        request('DELETE', `/buildings/${id}`),
      ]);

      expect(responses.map((r) => r.status)).toEqual([401, 401, 401]);
    });

    it('lets an administrator update', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/buildings', token, FACILITY);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('PUT', `/buildings/${_id}`, token, {name: 'Nowa nazwa'})).status).toBe(200);
    });

    it('lets an administrator delete', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      const created = await request('POST', '/buildings', token, FACILITY);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('DELETE', `/buildings/${_id}`, token)).status).toBe(200);
    });

    it('refuses an employee update with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      const response = await request('PUT', '/buildings/507f1f77bcf86cd799439011', token, {name: 'X'});

      expect(response.status).toBe(403);
    });

    it('refuses an office update with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      const response = await request('PUT', '/buildings/507f1f77bcf86cd799439011', token, {name: 'X'});

      expect(response.status).toBe(403);
    });

    it('refuses an employee delete with 403', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('DELETE', '/buildings/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });

    it('refuses an office delete with 403', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('DELETE', '/buildings/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });
  });
});
