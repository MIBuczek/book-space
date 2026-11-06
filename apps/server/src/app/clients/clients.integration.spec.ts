import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the T008 client changes over real HTTP, against the real `AppModule`, a real
 * MongoDB and a real signed JWT.
 *
 * The NIP rule and the `nick`/timestamp fields are the properties under test, and both
 * depend on the global `ValidationPipe` being wired the way `configure-app.ts` wires it —
 * a DTO validated by a hand-built `plainToInstance` would not reproduce the pipe's
 * `whitelist`/`forbidNonWhitelisted`/422 behaviour, which is exactly what the company
 * case turns on.
 */
describe('clients over HTTP', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

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

  const signIn = async (email: string, role: 'ADMIN' | 'EMPLOYEE'): Promise<string> => {
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

  const clientPayload = (overrides: Record<string, unknown> = {}) => ({
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

  const postClient = (token: string, body: Record<string, unknown>) =>
    fetch(`${ctx.baseUrl}/clients`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  it('rejects a company without a NIP with a field-level 422', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await postClient(token, clientPayload({type: 'COMPANY'}));

    expect(response.status).toBe(422);
    // The message names the field the caller must change.
    expect(await response.text()).toContain('NIP');
  });

  it('rejects a NIP supplied for an individual', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await postClient(token, clientPayload({type: 'INDIVIDUAL', nip: '8991234567'}));

    expect(response.status).toBe(422);
  });

  it('accepts a company that carries a NIP', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');

    const response = await postClient(token, clientPayload({type: 'COMPANY', nip: '8991234567'}));

    expect(response.status).toBe(201);
  });

  it('returns nick and timestamps from the client list', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');
    await postClient(token, clientPayload({nick: 'Kowalski'}));

    const response = await fetch(`${ctx.baseUrl}/clients`, {
      headers: {authorization: `Bearer ${token}`},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {items: Array<Record<string, unknown>>; total: number};
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.items[0]).toHaveProperty('nick', 'Kowalski');
    expect(body.items[0]).toHaveProperty('createdAt');
    expect(body.items[0]).toHaveProperty('updatedAt');
  });

  describe('paging and search (FR-022, FR-043, issue #123)', () => {
    const listClients = (token: string, query = '') =>
      fetch(`${ctx.baseUrl}/clients${query}`, {headers: {authorization: `Bearer ${token}`}});

    const seedClients = async (token: string, count: number): Promise<void> => {
      for (let index = 1; index <= count; index += 1) {
        const created = await postClient(
          token,
          clientPayload({name: `Klient ${String(index).padStart(2, '0')}`}),
        );
        expect(created.status).toBe(201);
      }
    };

    it('answers a paged envelope and never the whole collection by default', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      await seedClients(token, 3);

      const response = await listClients(token, '?limit=2&page=1');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {items: unknown[]; total: number; page: number; limit: number};
      expect(body.items).toHaveLength(2);
      // `total` is the pre-pagination count, so the client can page without a second read.
      expect(body.total).toBe(3);
      expect(body).toMatchObject({page: 1, limit: 2});
    });

    it('returns the last page and an empty page beyond it', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      await seedClients(token, 3);

      const last = (await (await listClients(token, '?limit=2&page=2')).json()) as {
        items: unknown[];
        total: number;
      };
      expect(last.items).toHaveLength(1);
      expect(last.total).toBe(3);

      const beyond = (await (await listClients(token, '?limit=2&page=9')).json()) as {
        items: unknown[];
        total: number;
      };
      expect(beyond.items).toHaveLength(0);
      expect(beyond.total).toBe(3);
    });

    it('searches by name, e-mail and phone', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');
      await postClient(token, clientPayload({name: 'Anna Nowak', email: 'anna@example.com', phone: '601002003'}));
      await postClient(token, clientPayload({name: 'Piotr Zielinski', email: 'piotr@firma.pl', phone: '602003004'}));

      const byName = (await (await listClients(token, '?search=Nowak')).json()) as {items: Array<{name: string}>};
      expect(byName.items.map((client) => client.name)).toEqual(['Anna Nowak']);

      const byEmail = (await (await listClients(token, '?search=firma.pl')).json()) as {
        items: Array<{name: string}>;
      };
      expect(byEmail.items.map((client) => client.name)).toEqual(['Piotr Zielinski']);

      const byPhone = (await (await listClients(token, '?search=601002')).json()) as {
        items: Array<{name: string}>;
      };
      expect(byPhone.items.map((client) => client.name)).toEqual(['Anna Nowak']);
    });

    it('rejects a page below 1 with a 422 from the query DTO', async () => {
      const token = await signIn('admin@example.com', 'ADMIN');

      const response = await listClients(token, '?page=0');

      expect(response.status).toBe(422);
    });
  });

  it('rejects a malformed zip code on update, which the mapped type would have let through', async () => {
    // The controller took `Partial<ClientDto>`, a type erased at runtime, so the pipe saw
    // `Object` and validated nothing. The concrete `UpdateClientDto` is what makes this
    // route reject the body.
    const token = await signIn('admin@example.com', 'ADMIN');
    const created = await postClient(token, clientPayload());
    const {_id} = (await created.json()) as {_id: string};

    const response = await fetch(`${ctx.baseUrl}/clients/${_id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify({zipCode: '55-01'}),
    });

    expect(response.status).toBe(422);
  });

  it('refuses an update that would leave a company without a NIP', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');
    const created = await postClient(token, clientPayload({type: 'INDIVIDUAL'}));
    const {_id} = (await created.json()) as {_id: string};

    // Turning the individual into a company without supplying a NIP is refused by the
    // service, which is the only place both halves of the merged record are visible.
    const response = await fetch(`${ctx.baseUrl}/clients/${_id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify({type: 'COMPANY'}),
    });

    expect(response.status).toBe(422);
  });

  it('accepts an update that keeps the record valid', async () => {
    const token = await signIn('admin@example.com', 'ADMIN');
    const created = await postClient(token, clientPayload());
    const {_id} = (await created.json()) as {_id: string};

    const response = await fetch(`${ctx.baseUrl}/clients/${_id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify({nick: 'Nowy nick'}),
    });

    expect(response.status).toBe(200);
  });
});
