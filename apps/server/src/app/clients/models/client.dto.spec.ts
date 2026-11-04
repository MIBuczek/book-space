import {validate} from 'class-validator';
import {ValidationPipe} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import {ClientDto, UpdateClientDto} from './client.dto';

/**
 * The NIP rule for a client (T008, FR-025, FR-026).
 *
 * The rule is conditional on the sibling `type`, so it lives in a custom constraint
 * rather than a single-property decorator. These cases drive the real `class-validator`
 * pipeline, because the constraint reads `args.object` — a hand-built check would not
 * exercise the path that actually decides the response.
 */
const validateDto = async (body: Record<string, unknown>) => {
  const instance = plainToInstance(ClientDto, body);
  return validate(instance, {skipMissingProperties: false});
};

const messagesFor = (errors: Awaited<ReturnType<typeof validate>>, property: string): string[] =>
  Object.values(errors.find((e) => e.property === property)?.constraints ?? {});

const base = {
  name: 'Firma Kowalscy',
  contactPerson: 'Jan Kowalski',
  phone: '500100200',
  email: 'firma@example.com',
  street: 'ul. Kwiatowa 1',
  city: 'siechnice',
  zipCode: '55-010',
};

describe('ClientDto NIP rule', () => {
  it('accepts a company with a NIP', async () => {
    const errors = await validateDto({...base, type: 'COMPANY', nip: '8991234567'});

    expect(errors).toHaveLength(0);
  });

  it('rejects a company with no NIP, naming the field', async () => {
    const errors = await validateDto({...base, type: 'COMPANY'});

    expect(errors.map((e) => e.property)).toContain('nip');
    expect(messagesFor(errors, 'nip')).toContain('NIP is required for a company');
  });

  it('rejects a company with an empty NIP', async () => {
    const errors = await validateDto({...base, type: 'COMPANY', nip: ''});

    expect(errors.map((e) => e.property)).toContain('nip');
  });

  it('accepts an individual with no NIP', async () => {
    const errors = await validateDto({...base, type: 'INDIVIDUAL'});

    expect(errors).toHaveLength(0);
  });

  it('rejects an individual that carries a NIP', async () => {
    // The legacy form hid the field for an individual. A payload that sets it anyway is
    // refused rather than silently dropped — a silent drop would hide a client-form bug.
    const errors = await validateDto({...base, type: 'INDIVIDUAL', nip: '8991234567'});

    expect(errors.map((e) => e.property)).toContain('nip');
    expect(messagesFor(errors, 'nip')).toContain('NIP must not be set for an individual');
  });

  it('leaves an unrecognised type to the type field rather than the NIP rule', async () => {
    // One clear error per problem: the NIP constraint returns true for a type it does not
    // know, and `@IsEnum` reports the bad type.
    const errors = await validateDto({...base, type: 'GOVERNMENT'});

    expect(errors.map((e) => e.property)).toEqual(['type']);
  });
});

describe('ClientDto field rules', () => {
  it('accepts the nick field', async () => {
    const errors = await validateDto({...base, type: 'INDIVIDUAL', nick: 'Kowalscy'});

    expect(errors).toHaveLength(0);
  });

  it('rejects a zip code that is not six characters', async () => {
    const errors = await validateDto({...base, type: 'INDIVIDUAL', zipCode: '55-01'});

    expect(errors.map((e) => e.property)).toContain('zipCode');
  });

  it('rejects a zip code with a character outside the allowed set', async () => {
    const errors = await validateDto({...base, type: 'INDIVIDUAL', zipCode: '55-01X'});

    expect(errors.map((e) => e.property)).toContain('zipCode');
  });

  it('does not declare the audit fields, so the pipe strips them', async () => {
    // `createdAt`/`updatedAt` are server-owned. `whitelist` removes a property the DTO
    // does not declare, so a caller cannot set the audit trail. Driven through the real
    // `ValidationPipe` — `plainToInstance` alone keeps the extra property, so it would not
    // show the stripping the route performs.
    const pipe = new ValidationPipe({whitelist: true, transform: true});
    const transformed = (await pipe.transform(
      {...base, type: 'INDIVIDUAL', createdAt: new Date()},
      {type: 'body', metatype: ClientDto}
    )) as Record<string, unknown>;

    expect('createdAt' in transformed).toBe(false);
  });
});

describe('UpdateClientDto', () => {
  it('accepts an empty body, because every field is optional', async () => {
    const errors = await validate(plainToInstance(UpdateClientDto, {}));

    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update that changes only the nick', async () => {
    const errors = await validate(plainToInstance(UpdateClientDto, {nick: 'Nowa nazwa'}));

    expect(errors).toHaveLength(0);
  });

  it('still validates a field that is present', async () => {
    const errors = await validate(plainToInstance(UpdateClientDto, {zipCode: '5'}));

    expect(errors.map((e) => e.property)).toContain('zipCode');
  });
});
