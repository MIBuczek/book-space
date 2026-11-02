import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {UserDto} from './user.dto';

/**
 * Runs the same validation the global `ValidationPipe` applies, so a payload that
 * passes here passes over HTTP. `whitelist`/`forbidNonWhitelisted` are set to match
 * `configureApp`, which is what rejects a body carrying a field the DTO does not
 * declare.
 */
const validateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UserDto, payload), {whitelist: true, forbidNonWhitelisted: true});

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery',
  recheckPassword: 'correct horse battery',
  role: 'ADMIN',
  ...overrides,
});

const fieldNames = (errors: {property: string}[]) => errors.map((e) => e.property);

describe('UserDto', () => {
  it('accepts a complete payload', async () => {
    await expect(validateDto(validPayload())).resolves.toHaveLength(0);
  });

  it('requires a role', async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).role;

    const errors = await validateDto(payload);

    expect(fieldNames(errors)).toContain('role');
  });

  it('rejects a role outside the enum', async () => {
    const errors = await validateDto(validPayload({role: 'SUPERUSER'}));

    expect(fieldNames(errors)).toContain('role');
  });

  it('accepts every role the authorisation matrix names', async () => {
    for (const role of ['ADMIN', 'OFFICE', 'EMPLOYEE']) {
      await expect(validateDto(validPayload({role, city: 'siechnice'}))).resolves.toHaveLength(0);
    }
  });

  it('rejects a mismatched recheckPassword with a message on that field', async () => {
    const errors = await validateDto(validPayload({recheckPassword: 'something else'}));

    const mismatch = errors.find((e) => e.property === 'recheckPassword');
    expect(mismatch).toBeDefined();
    // Field-level, not a whole-object failure: the caller is told which field is wrong.
    expect(Object.keys(mismatch?.constraints ?? {})).toHaveLength(1);
  });

  it('requires the password confirmation', async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).recheckPassword;

    const errors = await validateDto(payload);

    expect(fieldNames(errors)).toContain('recheckPassword');
  });

  it('requires a city for a non-administrator', async () => {
    const errors = await validateDto(validPayload({role: 'EMPLOYEE'}));

    expect(fieldNames(errors)).toContain('city');
  });

  it('does not require a city for an administrator', async () => {
    const errors = await validateDto(validPayload({role: 'ADMIN'}));

    expect(fieldNames(errors)).not.toContain('city');
  });

  it('accepts buildings as a list of property keys', async () => {
    await expect(
      validateDto(validPayload({role: 'OFFICE', city: 'siechnice', buildings: ['siechnice-a', 'siechnice-b']}))
    ).resolves.toHaveLength(0);
  });

  it('rejects a non-list buildings value', async () => {
    const errors = await validateDto(validPayload({role: 'OFFICE', city: 'siechnice', buildings: 'siechnice-a'}));

    expect(fieldNames(errors)).toContain('buildings');
  });

  it('rejects an unknown property rather than silently ignoring it', async () => {
    const errors = await validateDto(validPayload({isAdmin: true}));

    expect(fieldNames(errors)).toContain('isAdmin');
  });

  it('rejects a password shorter than six characters', async () => {
    const errors = await validateDto(validPayload({password: 'short', recheckPassword: 'short'}));

    expect(fieldNames(errors)).toContain('password');
  });
});
