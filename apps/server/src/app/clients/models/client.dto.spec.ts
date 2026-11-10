import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {ClientDto, UpdateClientDto} from './client.dto';

/**
 * Runs the same validation the global `ValidationPipe` applies, so a payload that
 * passes here passes over HTTP. `whitelist`/`forbidNonWhitelisted` match
 * `configureApp`, which is what rejects a body carrying a field the DTO does not declare.
 */
const validateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(ClientDto, payload), {whitelist: true, forbidNonWhitelisted: true});

const validateUpdateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateClientDto, payload), {whitelist: true, forbidNonWhitelisted: true});

const validPayload = (overrides: Record<string, unknown> = {}) => ({
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

const fieldNames = (errors: {property: string}[]) => errors.map((e) => e.property);

describe('ClientDto', () => {
  it('accepts a complete individual payload', async () => {
    await expect(validateDto(validPayload())).resolves.toHaveLength(0);
  });

  it('accepts a company that carries a NIP', async () => {
    await expect(
      validateDto(validPayload({type: 'COMPANY', nip: '8991234567'})),
    ).resolves.toHaveLength(0);
  });

  it('rejects a company with no NIP, naming the field', async () => {
    // FR-025 / the legacy ClientForm required NIP for Firma and hid it otherwise.
    const errors = await validateDto(validPayload({type: 'COMPANY'}));

    expect(fieldNames(errors)).toContain('nip');
  });

  it('rejects an individual that carries a NIP', async () => {
    // Refused rather than ignored: silently dropping it would let a user believe the
    // tax id was stored.
    const errors = await validateDto(validPayload({type: 'INDIVIDUAL', nip: '8991234567'}));

    expect(fieldNames(errors)).toContain('nip');
  });

  it('accepts an individual with an empty-string NIP, as the legacy form sends', async () => {
    // The legacy form submitted `nip: cred.nip || ''`, so an individual arrives with an
    // empty string rather than no key. An empty value counts as absent.
    await expect(validateDto(validPayload({type: 'INDIVIDUAL', nip: ''}))).resolves.toHaveLength(0);
  });

  it('rejects a company NIP shorter than ten characters', async () => {
    const errors = await validateDto(validPayload({type: 'COMPANY', nip: '123'}));

    expect(fieldNames(errors)).toContain('nip');
  });

  it('rejects a company NIP with a character the pattern does not allow', async () => {
    const errors = await validateDto(validPayload({type: 'COMPANY', nip: '899123456A'}));

    expect(fieldNames(errors)).toContain('nip');
  });

  it('accepts a payload with no nick, and one with it', async () => {
    const withoutNick = validPayload();
    delete (withoutNick as Record<string, unknown>).nick;

    await expect(validateDto(withoutNick)).resolves.toHaveLength(0);
    await expect(validateDto(validPayload({nick: 'Kowalski'}))).resolves.toHaveLength(0);
  });

  it('rejects a zip code that is not six characters', async () => {
    const errors = await validateDto(validPayload({zipCode: '55-01'}));

    expect(fieldNames(errors)).toContain('zipCode');
  });

  it('rejects a zip code with a character the pattern does not allow', async () => {
    // The schema and the DTO must agree: the schema is the backstop, the DTO is the
    // boundary, and a payload that passes here must not be refused there.
    const errors = await validateDto(validPayload({zipCode: '55-01A'}));

    expect(fieldNames(errors)).toContain('zipCode');
  });

  it('rejects a body carrying a field the DTO does not declare', async () => {
    await expect(validateDto(validPayload({admin: true}))).resolves.not.toHaveLength(0);
  });
});

describe('UpdateClientDto', () => {
  it('accepts an empty body, because every field is optional', async () => {
    await expect(validateUpdateDto({})).resolves.toHaveLength(0);
  });

  it('accepts a single field', async () => {
    await expect(validateUpdateDto({nick: 'Kowalski'})).resolves.toHaveLength(0);
  });

  it('still rejects a malformed zip code, which the partial type would have let through', async () => {
    // The controller previously took `Partial<ClientDto>`, a mapped type erased at
    // runtime, so the pipe saw `Object` and validated nothing.
    const errors = await validateUpdateDto({zipCode: '55-01'});

    expect(fieldNames(errors)).toContain('zipCode');
  });

  it('does not enforce the NIP rule, which needs the merged record', async () => {
    // A partial body may carry `nip` without `type`, so the cross-field rule cannot run
    // here; `ClientService.updateClient` enforces it on the merged document.
    await expect(validateUpdateDto({type: 'COMPANY'})).resolves.toHaveLength(0);
  });

  it('rejects a NIP outside ten to fifteen characters when it is present', async () => {
    const errors = await validateUpdateDto({nip: '123'});

    expect(fieldNames(errors)).toContain('nip');
  });

  it('accepts an active flag, which the deactivation route sends (T059)', async () => {
    await expect(validateUpdateDto({active: false})).resolves.toHaveLength(0);
  });

  it('rejects a non-boolean active value', async () => {
    const errors = await validateUpdateDto({active: 'no'});

    expect(fieldNames(errors)).toContain('active');
  });
});
