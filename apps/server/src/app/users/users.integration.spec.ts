import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the `users` routes are administrator-only over real HTTP, against the real
 * `AppModule`, a real MongoDB and a real signed JWT.
 *
 * This is an integration test rather than a unit test of `RolesGuard` for a reason:
 * the guard was already covered by `authorization.integration.spec.ts`, and it
 * passed. What could not be covered there is whether the guard is *attached* to the
 * users routes and whether the role reaches it through a genuine token — a unit
 * test with a stubbed guard would pass whether or not the controller was wired up.
 */
describe('users routes are administrator-only', () => {
  let ctx: MongoTestContext;
  let userModel: {
    create: (doc: Record<string, unknown>) => Promise<unknown>;
    findOne: (filter: Record<string, unknown>) => Promise<unknown>;
    countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  };

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

  const seedUser = async (email: string, role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE') => {
    // The schema's pre-save hook hashes the password, so the plaintext is what the
    // sign-in request below must send.
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role,
      city: role === 'ADMIN' ? undefined : 'siechnice',
      active: true,
    });
  };

  const signIn = async (email: string): Promise<string> => {
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {token: string};
    return body.token;
  };

  const getUsers = (token?: string) =>
    fetch(`${ctx.baseUrl}/users`, {
      headers: token ? {authorization: `Bearer ${token}`} : {},
    });

  it('answers 401 to an unauthenticated caller', async () => {
    const response = await getUsers();

    expect(response.status).toBe(401);
  });

  it('answers 403 to an authenticated employee', async () => {
    await seedUser('employee@example.com', 'EMPLOYEE');
    const token = await signIn('employee@example.com');

    const response = await getUsers(token);

    expect(response.status).toBe(403);
  });

  it('answers 403 to an authenticated office user', async () => {
    await seedUser('office@example.com', 'OFFICE');
    const token = await signIn('office@example.com');

    const response = await getUsers(token);

    expect(response.status).toBe(403);
  });

  it('answers 200 to an administrator', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');

    const response = await getUsers(token);

    expect(response.status).toBe(200);
  });

  it('lets an administrator create, read and update a user', async () => {
    // The success half of every users row, not just the list read: the class decorator
    // admits the administrator to all five routes, so the create and the single read are
    // proved here rather than assumed from the list case.
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');

    const created = await fetch(`${ctx.baseUrl}/users`, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'correct horse battery',
        recheckPassword: 'correct horse battery',
        email: 'grace@example.com',
        role: 'EMPLOYEE',
        city: 'siechnice',
      }),
    });
    expect(created.status).toBe(201);
    const {_id} = (await created.json()) as {_id: string};

    expect((await fetch(`${ctx.baseUrl}/users/${_id}`, {headers: {authorization: `Bearer ${token}`}})).status).toBe(200);

    const updated = await fetch(`${ctx.baseUrl}/users/${_id}`, {
      method: 'PUT',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify({firstName: 'Grace B.'}),
    });
    expect(updated.status).toBe(200);
  });

  it('refuses a write from an employee as well as a read', async () => {
    await seedUser('employee@example.com', 'EMPLOYEE');
    const token = await signIn('employee@example.com');

    const response = await fetch(`${ctx.baseUrl}/users/507f1f77bcf86cd799439011`, {
      method: 'DELETE',
      headers: {authorization: `Bearer ${token}`},
    });

    expect(response.status).toBe(403);
  });

  it('answers 403 to an employee on all five routes (T015)', async () => {
    // The class-level `@Roles('ADMIN')` is the whole control, so it has to be proved on
    // every route rather than the two the earlier cases happened to use: a route that
    // overrode the class decorator would pass a GET-only check and leak a write.
    await seedUser('employee@example.com', 'EMPLOYEE');
    const token = await signIn('employee@example.com');
    const auth = {authorization: `Bearer ${token}`};
    const id = '507f1f77bcf86cd799439011';

    const responses = await Promise.all([
      fetch(`${ctx.baseUrl}/users`, {headers: auth}),
      fetch(`${ctx.baseUrl}/users/${id}`, {headers: auth}),
      fetch(`${ctx.baseUrl}/users`, {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({})}),
      fetch(`${ctx.baseUrl}/users/${id}`, {method: 'PUT', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({firstName: 'Grace'})}),
      fetch(`${ctx.baseUrl}/users/${id}`, {method: 'DELETE', headers: auth}),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
  });

  it('never returns a password hash to an administrator', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');

    const response = await getUsers(token);
    const body = (await response.json()) as {items?: unknown[]} | unknown[];

    const users = Array.isArray(body) ? body : (body.items ?? []);
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(user).not.toHaveProperty('password');
    }
  });

  it('does not return the password hash from sign-in either', async () => {
    await seedUser('admin@example.com', 'ADMIN');

    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email: 'admin@example.com', password: PASSWORD}),
    });
    const body = (await response.json()) as {user: Record<string, unknown>};

    expect(body.user).not.toHaveProperty('password');
  });

  /**
   * The last-administrator rule (T015, acceptance criterion 3).
   *
   * It has to be proved over HTTP rather than in the service alone: the rule is a
   * `409`, and the error filter is what turns the exception into that status. A
   * service-level test cannot see whether the filter narrows the body or whether the
   * route answers `200` because the write reached the driver.
   */
  const deleteUser = (id: string, token: string) =>
    fetch(`${ctx.baseUrl}/users/${id}`, {method: 'DELETE', headers: {authorization: `Bearer ${token}`}});

  const patchUser = (id: string, body: Record<string, unknown>, token: string) =>
    fetch(`${ctx.baseUrl}/users/${id}`, {
      method: 'PUT',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify(body),
    });

  const idOf = async (email: string) => {
    const user = await userModel.findOne({email});
    return String((user as {_id: unknown})._id);
  };

  it('refuses to delete the only administrator with 409', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');
    const adminId = await idOf('admin@example.com');

    const response = await deleteUser(adminId, token);

    expect(response.status).toBe(409);
    expect(await userModel.countDocuments({email: 'admin@example.com'})).toBe(1);
  });

  it('deletes an administrator when a second active one remains', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    await seedUser('second@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');
    const secondId = await idOf('second@example.com');

    const response = await deleteUser(secondId, token);

    expect(response.status).toBe(200);
    expect(await userModel.countDocuments({email: 'second@example.com'})).toBe(0);
  });

  it('refuses to deactivate the only administrator with 409', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');
    const adminId = await idOf('admin@example.com');

    const response = await patchUser(adminId, {active: false}, token);

    expect(response.status).toBe(409);
    expect((await userModel.findOne({email: 'admin@example.com'}) as {active: boolean}).active).toBe(true);
  });

  it('refuses to demote the only administrator with 409', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');
    const adminId = await idOf('admin@example.com');

    const response = await patchUser(adminId, {role: 'EMPLOYEE'}, token);

    expect(response.status).toBe(409);
    expect((await userModel.findOne({email: 'admin@example.com'}) as {role: string}).role).toBe('ADMIN');
  });

  it('allows an ordinary edit to the only administrator', async () => {
    await seedUser('admin@example.com', 'ADMIN');
    const token = await signIn('admin@example.com');
    const adminId = await idOf('admin@example.com');

    const response = await patchUser(adminId, {firstName: 'Grace'}, token);

    expect(response.status).toBe(200);
    expect((await userModel.findOne({email: 'admin@example.com'}) as {firstName: string}).firstName).toBe('Grace');
  });
});
