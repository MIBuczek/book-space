import bcrypt from 'bcrypt';
import * as os from 'os';
import mongoose from 'mongoose';
import {
  AdministratorExistsError,
  bootstrapAdministrator,
  MissingFieldError,
  requireField,
} from './bootstrap';
import {createBootstrapTestContext} from '../testing/mongo-test-context';
import type {IBootstrapTestContext} from '../testing/mongo-test-context';

/**
 * The bootstrap against a real `mongod` (FR-046, SC-009).
 *
 * The point of the tool is that the account it writes is one the API can sign in against, so the
 * assertions read the document back and compare the stored password with `bcrypt`. A stub model
 * would prove only that the tool called `create`.
 *
 * The tool closes the connection it is handed, so the dependency opens a fresh one per call
 * rather than reusing the context's — the same shape `tools/migration/src/lib/cli.spec.ts` uses.
 */

const ADMIN = {
  firstName: 'Anna',
  lastName: 'Nowak',
  email: 'admin@example.com',
  password: 'secret1',
};

/** The connect dependency the tool takes, opening its own connection as production does. */
const connect = async (uri: string): Promise<mongoose.Connection> =>
  mongoose.createConnection(uri, {runtimeAdapters: {os}}).asPromise();

describe('requireField', () => {
  it('returns a non-empty value', () => {
    expect(requireField('value', 'email')).toBe('value');
  });

  it('rejects an undefined value', () => {
    expect(() => requireField(undefined, 'email')).toThrow(new MissingFieldError('email'));
  });

  it('rejects a whitespace-only value', () => {
    expect(() => requireField('   ', 'email')).toThrow(new MissingFieldError('email'));
  });
});

describe('bootstrapAdministrator', () => {
  let context: IBootstrapTestContext;

  beforeAll(async () => {
    context = await createBootstrapTestContext();
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
  });

  /** Reads the raw user document, so the assertion does not depend on the tool's own model. */
  const readUser = async (email: string): Promise<Record<string, unknown> | null> =>
    context.connection.collection('users').findOne({email});

  const countUsers = async (): Promise<number> =>
    context.connection.collection('users').countDocuments();

  it('creates an active administrator whose stored password is a bcrypt hash of the input', async () => {
    const {email} = await bootstrapAdministrator(context.uri, ADMIN, {connect});

    expect(email).toBe(ADMIN.email);

    const stored = await readUser(ADMIN.email);
    expect(stored).not.toBeNull();
    expect(stored?.['role']).toBe('ADMIN');
    expect(stored?.['active']).toBe(true);
    expect(stored?.['password']).not.toBe(ADMIN.password);
    // The schema's pre('save') hook hashed it: the stored value must verify against the plaintext.
    expect(await bcrypt.compare(ADMIN.password, stored?.['password'] as string)).toBe(true);
  });

  it('normalises the e-mail to lower case, as the schema declares', async () => {
    await bootstrapAdministrator(context.uri, {...ADMIN, email: 'Admin@Example.COM'}, {connect});

    expect(await readUser('admin@example.com')).not.toBeNull();
  });

  it('refuses a second administrator when an active one already exists', async () => {
    await bootstrapAdministrator(context.uri, ADMIN, {connect});

    await expect(
      bootstrapAdministrator(context.uri, {...ADMIN, email: 'second@example.com'}, {connect})
    ).rejects.toBeInstanceOf(AdministratorExistsError);

    expect(await countUsers()).toBe(1);
  });

  it('does not count a deactivated administrator as one that exists', async () => {
    // A database whose only administrator has been deactivated is, for the purpose of "can
    // anyone sign in and administer?", empty. Refusing here would leave it unrecoverable.
    await bootstrapAdministrator(context.uri, ADMIN, {connect});
    await context.connection
      .collection('users')
      .updateOne({email: ADMIN.email}, {$set: {active: false}});

    await expect(
      bootstrapAdministrator(context.uri, {...ADMIN, email: 'fresh@example.com'}, {connect})
    ).resolves.toEqual({email: 'fresh@example.com'});
  });

  it('refuses a blank field before writing anything', async () => {
    await expect(
      bootstrapAdministrator(context.uri, {...ADMIN, password: ''}, {connect})
    ).rejects.toBeInstanceOf(MissingFieldError);

    expect(await countUsers()).toBe(0);
  });

  it('closes the connection it opened, even when it refuses', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const userModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
      createIndexes: jest.fn(),
    };
    const fakeConnect = jest.fn().mockResolvedValue({models: {}, model: () => userModel, close});

    await expect(
      bootstrapAdministrator(context.uri, ADMIN, {connect: fakeConnect})
    ).rejects.toBeInstanceOf(AdministratorExistsError);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
