import mongoose, {Model} from 'mongoose';
import bcrypt from 'bcrypt';
import {UserSchema, User} from './user.schema';

// The schema's pre('save') hook is what is under test, so the real schema is used
// rather than a hand-built one. Cloning keeps the hook while letting this spec turn
// command buffering off: without a database the save fails fast *after* the hooks run,
// which is exactly the point at which the password has been transformed.
const isolatedSchema = UserSchema.clone();
isolatedSchema.set('bufferCommands', false);

let UserModel: Model<User>;

beforeAll(() => {
  UserModel = mongoose.model<User>('UserSchemaSpec', isolatedSchema);
});

afterAll(() => {
  mongoose.deleteModel('UserSchemaSpec');
});

const userDoc = (password: string) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password,
  createdAt: new Date('2020-01-01'),
  lastLogin: new Date('2020-01-01')
});

// No database is available, so every save rejects. That is fine: the pre('save')
// hooks have already run by then, and the document is mutated in place.
const saveIgnoringConnectionError = async (doc: {save: () => Promise<unknown>}) => {
  try {
    await doc.save();
  } catch {
    /* expected: no MongoDB in the test environment */
  }
};

describe('userSchema password hashing', () => {
  it('hashes the password exactly once when creating a user', async () => {
    const doc = new UserModel(userDoc('correct horse battery'));

    await saveIgnoringConnectionError(doc);

    expect(doc.password).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare('correct horse battery', doc.password)).resolves.toBe(true);
  });

  it('does not re-hash the password when an unrelated field is saved', async () => {
    const original = userDoc('correct horse battery');
    const existing = new UserModel(original);
    await saveIgnoringConnectionError(existing);
    const storedHash = existing.password;

    // Simulate a later save of the same user (as a find + save would produce).
    const reloaded = UserModel.hydrate({...original, password: storedHash});
    reloaded.lastLogin = new Date();
    await saveIgnoringConnectionError(reloaded);

    expect(reloaded.password).toBe(storedHash);
  });

  it('still authenticates after an unrelated field is saved', async () => {
    const original = userDoc('correct horse battery');
    const existing = new UserModel(original);
    await saveIgnoringConnectionError(existing);

    const reloaded = UserModel.hydrate({...original, password: existing.password});
    reloaded.lastLogin = new Date();
    await saveIgnoringConnectionError(reloaded);

    await expect(bcrypt.compare('correct horse battery', reloaded.password)).resolves.toBe(true);
  });

  it('re-hashes when the password itself is changed', async () => {
    const original = userDoc('correct horse battery');
    const existing = new UserModel(original);
    await saveIgnoringConnectionError(existing);
    const storedHash = existing.password;

    const reloaded = UserModel.hydrate({...original, password: storedHash});
    reloaded.password = 'a different secret';
    await saveIgnoringConnectionError(reloaded);

    expect(reloaded.password).not.toBe(storedHash);
    await expect(bcrypt.compare('a different secret', reloaded.password)).resolves.toBe(true);
    await expect(bcrypt.compare('correct horse battery', reloaded.password)).resolves.toBe(false);
  });
});
