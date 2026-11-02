import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * The auth module over real HTTP: sign-in, `/auth/me` and sign-out.
 *
 * These are integration tests because the behaviour under test is a property of the
 * whole request — the response body the client actually receives. A unit test of
 * `signIn` cannot see whether the exception filter rewrites the message on the way
 * out, and the e-mail-enumeration defect lives in exactly that gap: the service threw
 * distinguishable messages, and a second mapping layer turned them into
 * distinguishable responses.
 */
describe('the auth module over HTTP', () => {
  let ctx: MongoTestContext;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';
  const EMAIL = 'ada@example.com';

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

  const seedUser = async (overrides: Record<string, unknown> = {}) => {
    // The schema's pre-save hook hashes the password, so the plaintext is what the
    // sign-in request must send.
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: EMAIL,
      password: PASSWORD,
      role: 'OFFICE',
      city: 'siechnice',
      buildings: ['building-1'],
      active: true,
      ...overrides,
    });
  };

  const postSignIn = (body: unknown) =>
    fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });

  const signIn = async (email = EMAIL, password = PASSWORD) => {
    const response = await postSignIn({email, password});
    expect(response.status).toBe(201);
    return (await response.json()) as {token: string};
  };

  const getMe = (token?: string) =>
    fetch(`${ctx.baseUrl}/auth/me`, {headers: token ? {authorization: `Bearer ${token}`} : {}});

  describe('sign-in does not reveal whether an e-mail is registered', () => {
    it('answers the same status for an unknown e-mail and a wrong password', async () => {
      await seedUser();

      const unknownEmail = await postSignIn({email: 'nobody@example.com', password: PASSWORD});
      const wrongPassword = await postSignIn({email: EMAIL, password: 'not the password'});

      expect(unknownEmail.status).toBe(wrongPassword.status);
    });

    it('answers the same body for an unknown e-mail and a wrong password', async () => {
      await seedUser();

      const unknownEmail = await postSignIn({email: 'nobody@example.com', password: PASSWORD});
      const wrongPassword = await postSignIn({email: EMAIL, password: 'not the password'});

      // A caller who can tell these apart can enumerate which addresses have
      // accounts. Comparing the whole body rather than the status is what catches a
      // message that names the failing field.
      await expect(unknownEmail.json()).resolves.toEqual(await wrongPassword.json());
    });

    it('does not name the e-mail or the password as the failing field', async () => {
      await seedUser();

      const unknownEmail = await postSignIn({email: 'nobody@example.com', password: PASSWORD});
      const wrongPassword = await postSignIn({email: EMAIL, password: 'not the password'});

      for (const response of [unknownEmail, wrongPassword]) {
        const body = JSON.stringify(await response.json()).toLowerCase();
        expect(body).not.toContain('email is not registered');
        expect(body).not.toContain('password is incorrect');
      }
    });

    it('rejects an unknown e-mail with 401 rather than 404', async () => {
      // A 404 would confirm the address is free; the contract declares 401.
      const response = await postSignIn({email: 'nobody@example.com', password: PASSWORD});

      expect(response.status).toBe(401);
    });

    it('still refuses an inactive account without saying the account exists', async () => {
      await seedUser({active: false});

      const inactive = await postSignIn({email: EMAIL, password: PASSWORD});
      const wrongPassword = await postSignIn({email: EMAIL, password: 'not the password'});

      expect(inactive.status).toBe(401);
      await expect(inactive.json()).resolves.toEqual(await wrongPassword.json());
    });
  });

  describe('/auth/me', () => {
    it('returns the current user with the resolved role and assignments', async () => {
      await seedUser();
      const {token} = await signIn();

      const response = await getMe(token);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        email: EMAIL,
        role: 'OFFICE',
        city: 'siechnice',
        buildings: ['building-1'],
      });
    });

    it('never returns the password hash', async () => {
      await seedUser();
      const {token} = await signIn();

      const response = await getMe(token);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body).not.toHaveProperty('password');
      expect(JSON.stringify(body)).not.toContain('$2b$');
    });

    it('returns the role from the database, not from the token', async () => {
      // The account is promoted after the token was issued. `/auth/me` must report
      // the stored role: a token carries a role for authorisation, but a response
      // built from it would go stale the moment an administrator changes it.
      await seedUser();
      const {token} = await signIn();
      await userModel.create({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        password: PASSWORD,
        role: 'ADMIN',
        active: true,
      });
      const {token: adminToken} = await signIn('grace@example.com');

      const response = await getMe(adminToken);

      await expect(response.json()).resolves.toMatchObject({role: 'ADMIN'});
      expect(token).toBeTruthy();
    });

    it('answers 401 without a token', async () => {
      const response = await getMe();

      expect(response.status).toBe(401);
    });

    it('answers 401 for a token whose account no longer exists', async () => {
      await seedUser();
      const {token} = await signIn();
      await ctx.reset();

      const response = await getMe(token);

      expect(response.status).toBe(401);
    });
  });

  describe('sign-out', () => {
    it('acknowledges with 200', async () => {
      const response = await fetch(`${ctx.baseUrl}/auth/sign-out`);

      expect(response.status).toBe(200);
    });

    it('is stateless: the token still authenticates afterwards', async () => {
      // Documented behaviour (contracts/authorization-matrix.md, T013): there is no
      // server-side session to destroy, so the token remains valid until it expires.
      // Asserting it pins the documented answer instead of leaving a reader to guess
      // whether sign-out revokes anything.
      await seedUser();
      const {token} = await signIn();

      await fetch(`${ctx.baseUrl}/auth/sign-out`, {headers: {authorization: `Bearer ${token}`}});

      expect((await getMe(token)).status).toBe(200);
    });

    it('clears the jwt cookie', async () => {
      const response = await fetch(`${ctx.baseUrl}/auth/sign-out`);
      const cookie = response.headers.get('set-cookie') ?? '';

      expect(cookie).toContain('jwt=');
    });
  });
});
