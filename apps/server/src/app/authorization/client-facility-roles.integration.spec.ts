import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the client and facility write rules over real HTTP, against the real `AppModule`,
 * a real MongoDB and a real signed JWT (T025, `authorization-matrix.md`).
 *
 * This is an integration test rather than a unit test of the controllers because the
 * question is whether `RolesGuard` and `@Roles` are *attached* to the routes and whether the
 * role reaches them through a genuine token. A unit test that stubs the guard passes whether
 * or not the decorator is on the controller — which is exactly the shape of the defect
 * (both controllers were guarded by `AuthGuard('jwt')` alone).
 *
 * The matrix rows:
 * - clients: read `OFFICE`/`ADMIN`, write `ADMIN`
 * - facilities: read `EMPLOYEE`/`OFFICE`/`ADMIN`, write `ADMIN`
 */
describe('client and facility role restrictions over HTTP', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  const clientBody = {
    type: 'COMPANY',
    name: 'Firma Kowalscy',
    contactPerson: 'Jan Kowalski',
    phone: '500100200',
    email: 'firma@example.com',
    street: 'ul. Kwiatowa 1',
    city: 'siechnice',
    zipCode: '55-010',
  };

  const buildingBody = {
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'siechnice',
    sizes: ['1/1'],
    email: 'siechnice.hala@gmail.com',
    phone: '609996064',
    street: 'ul. Sportowa 1',
    zipCode: '55-010',
    lighting: false,
    toilets: false,
    employees: ['Bożena Kaczyńska'],
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

  const request = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? {authorization: `Bearer ${token}`} : {}),
      },
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });

  describe('clients', () => {
    it('answers 401 to an unauthenticated read', async () => {
      expect((await request('GET', '/clients')).status).toBe(401);
    });

    it('answers 403 when an employee reads clients', async () => {
      // The matrix restricts client reads to OFFICE and ADMIN.
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('GET', '/clients', token)).status).toBe(403);
    });

    it('lets an office user read clients', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('GET', '/clients', token)).status).toBe(200);
    });

    it('answers 403 when an employee creates a client', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('POST', '/clients', token, clientBody)).status).toBe(403);
    });

    it('answers 403 when an office user creates a client', async () => {
      // Read is wider than write: an office user may read but not write.
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('POST', '/clients', token, clientBody)).status).toBe(403);
    });

    it('answers 403 when an office user updates a client', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('PUT', '/clients/507f1f77bcf86cd799439011', token, {name: 'Inna'})).status).toBe(403);
    });

    it('answers 403 when an office user deletes a client', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('DELETE', '/clients/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });

    it('lets an administrator create, read, update and delete a client', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      const created = await request('POST', '/clients', token, clientBody);
      expect(created.status).toBe(201);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('GET', '/clients', token)).status).toBe(200);
      expect((await request('PUT', `/clients/${_id}`, token, {name: 'Firma Nowak'})).status).toBe(200);
      expect((await request('DELETE', `/clients/${_id}`, token)).status).toBe(200);
    });
  });

  describe('facilities', () => {
    it('answers 401 to an unauthenticated read', async () => {
      expect((await request('GET', '/buildings')).status).toBe(401);
    });

    it('lets an employee read facilities', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('GET', '/buildings', token)).status).toBe(200);
    });

    it('lets an office user read facilities', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('GET', '/buildings', token)).status).toBe(200);
    });

    it('answers 403 when an employee creates a facility', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('POST', '/buildings', token, buildingBody)).status).toBe(403);
    });

    it('answers 403 when an office user creates a facility', async () => {
      const token = await signIn('office@example.com', 'OFFICE');

      expect((await request('POST', '/buildings', token, buildingBody)).status).toBe(403);
    });

    it('answers 403 when an employee updates a facility', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('PUT', '/buildings/507f1f77bcf86cd799439011', token, {lighting: true})).status).toBe(403);
    });

    it('answers 403 when an employee deletes a facility', async () => {
      const token = await signIn('employee@example.com', 'EMPLOYEE');

      expect((await request('DELETE', '/buildings/507f1f77bcf86cd799439011', token)).status).toBe(403);
    });

    it('lets an administrator create and delete a facility', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      const created = await request('POST', '/buildings', token, buildingBody);
      expect(created.status).toBe(201);
      const {_id} = (await created.json()) as {_id: string};

      expect((await request('DELETE', `/buildings/${_id}`, token)).status).toBe(200);
    });
  });
});
