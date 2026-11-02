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

  it('refuses a write from an employee as well as a read', async () => {
    await seedUser('employee@example.com', 'EMPLOYEE');
    const token = await signIn('employee@example.com');

    const response = await fetch(`${ctx.baseUrl}/users/507f1f77bcf86cd799439011`, {
      method: 'DELETE',
      headers: {authorization: `Bearer ${token}`},
    });

    expect(response.status).toBe(403);
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
});
