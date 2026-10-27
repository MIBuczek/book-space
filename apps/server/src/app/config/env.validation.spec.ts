import {validateEnv} from './env.validation';

const VALID_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/book_space';
const VALID_SECRET = 'a'.repeat(40);

describe('validateEnv', () => {
  it('accepts a valid environment', () => {
    const config = {DB_URI: VALID_URI, JWT_SECRET: VALID_SECRET};
    expect(validateEnv(config)).toBe(config);
  });

  it('rejects a missing DB_URI', () => {
    expect(() => validateEnv({JWT_SECRET: VALID_SECRET})).toThrow(/DB_URI/);
  });

  it('rejects a missing JWT_SECRET', () => {
    expect(() => validateEnv({DB_URI: VALID_URI})).toThrow(/JWT_SECRET/);
  });

  // A short secret is the difference between a forgeable token and a safe one.
  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({DB_URI: VALID_URI, JWT_SECRET: 'too-short'})).toThrow(/at least 32/);
  });

  it('rejects a non-mongodb DB_URI', () => {
    expect(() => validateEnv({DB_URI: 'postgres://localhost/db', JWT_SECRET: VALID_SECRET})).toThrow(/mongodb/);
  });

  // Guard against the old failure mode where a missing variable reached
  // JwtModule as the literal string "undefined".
  it('rejects undefined values', () => {
    expect(() => validateEnv({DB_URI: undefined, JWT_SECRET: undefined})).toThrow(/Invalid environment configuration/);
  });

  it('names the example file in the error so the fix is obvious', () => {
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });
});
