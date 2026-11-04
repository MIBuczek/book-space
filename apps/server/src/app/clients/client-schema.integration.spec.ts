import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the client schema rules over real HTTP and a real MongoDB (T008, FR-025, FR-026).
 *
 * The unit spec drives the DTO in isolation; what only a real request shows is that the
 * rule survives the whole stack — the global `ValidationPipe` (422), the schema validator
 * for a raw write, and the service's own re-check on the update path, which `updateOne`
 * would otherwise skip because it does not run document middleware.
 */
describe('client schema rules over HTTP', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};
  let clientModel: {
    create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>;
    createIndexes: () => Promise<unknown>;
  };

  const PASSWORD = 'correct horse battery';

  const company = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'COMPANY',
    name: 'Firma Kowalscy',
    contactPerson: 'Jan Kowalski',
    phone: '500100200',
    email: 'firma@example.com',
    street: 'ul. Kwiatowa 1',
    city: 'siechnice',
    zipCode: '55-010',
    nip: '8991234567',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    userModel = ctx.app.get(getModelToken('User'));
    clientModel = ctx.app.get(getModelToken('Client'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    // `reset()` drops the database and its indexes with it; rebuild so the name index
    // assertion below is about the declaration rather than about autoIndex timing.
    await clientModel.createIndexes();
  });

  const adminToken = async (): Promise<string> => {
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
    return ((await response.json()) as {token: string}).token;
  };

  const withoutNip = (overrides: Record<string, unknown> = {}) => {
    const body = company(overrides);
    delete body.nip;
    return body;
  };

  const post = (token: string, body: unknown) =>
    fetch(`${ctx.baseUrl}/clients`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  const put = (token: string, id: string, body: unknown) =>
    fetch(`${ctx.baseUrl}/clients/${id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  it('answers 422 and names the field when a company has no NIP', async () => {
    const token = await adminToken();

    const response = await post(token, withoutNip());

    expect(response.status).toBe(422);
    const body = (await response.json()) as {message: string[]};
    expect(body.message.join(' ')).toContain('NIP');
  });

  it('creates a company that carries a NIP', async () => {
    const token = await adminToken();

    const response = await post(token, company());

    expect(response.status).toBe(201);
  });

  it('answers 422 when an individual carries a NIP', async () => {
    const token = await adminToken();

    const response = await post(token, company({type: 'INDIVIDUAL', nip: '8991234567'}));

    expect(response.status).toBe(422);
  });

  it('creates an individual with no NIP', async () => {
    const token = await adminToken();

    const response = await post(token, withoutNip({type: 'INDIVIDUAL'}));

    expect(response.status).toBe(201);
  });

  it('returns nick and the audit timestamps from GET /clients', async () => {
    const token = await adminToken();
    const created = await post(token, company({nick: 'Kowalscy'}));
    expect(created.status).toBe(201);

    const response = await fetch(`${ctx.baseUrl}/clients`, {
      headers: {authorization: `Bearer ${token}`},
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({nick: 'Kowalscy'});
    expect(body[0].createdAt).toBeDefined();
    expect(body[0].updatedAt).toBeDefined();
  });

  it('refuses an update that puts a NIP on an individual, using the stored type', async () => {
    // The update body carries only `nip`; the stored record is the individual. The service
    // has to load it, because `updateOne` runs no document validators and a partial body
    // cannot see the stored `type`.
    const token = await adminToken();
    const created = await post(token, withoutNip({type: 'INDIVIDUAL'}));
    const {_id} = (await created.json()) as {_id: string};

    const response = await put(token, _id, {nip: '8991234567'});

    expect(response.status).toBe(422);
  });

  it('refuses an update that blanks the NIP of a company', async () => {
    const token = await adminToken();
    const created = await post(token, company());
    const {_id} = (await created.json()) as {_id: string};

    const response = await put(token, _id, {nip: ''});

    expect(response.status).toBe(422);
  });

  it('stamps updatedAt on an update', async () => {
    const token = await adminToken();
    const created = await post(token, company());
    const {_id} = (await created.json()) as {_id: string};
    const before = (await (await fetch(`${ctx.baseUrl}/clients/${_id}`, {
      headers: {authorization: `Bearer ${token}`},
    })).json()) as {updatedAt: string};

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await put(token, _id, {nick: 'Nowa nazwa'})).status).toBe(200);

    const after = (await (await fetch(`${ctx.baseUrl}/clients/${_id}`, {
      headers: {authorization: `Bearer ${token}`},
    })).json()) as {updatedAt: string};
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
  });

  it('rejects a raw write that bypasses the DTO, via the schema validator', async () => {
    // The DTO is the boundary; the schema is the control that stops a direct write. A
    // company with no NIP must not be storable even through the model.
    await expect(clientModel.create(company({nip: undefined}))).rejects.toThrow(/NIP/);
  });

  it('declares an index on name', async () => {
    const model = ctx.app.get(getModelToken('Client')) as unknown as {
      collection: {indexes: () => Promise<Array<{key: Record<string, unknown>}>>};
    };
    const indexes = await model.collection.indexes();

    expect(indexes.some((index) => index.key.name === 1)).toBe(true);
  });
});
