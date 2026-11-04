import {ValidationArguments} from 'class-validator';
import {
  ClientNip,
  hasNipValue,
  hasValidNipFormat,
  isNipRequired,
  isNipValid,
  NIP_MAX_LENGTH,
  NIP_MIN_LENGTH,
} from './client-nip.validator';

const args = (object: Record<string, unknown>) => ({object} as ValidationArguments);

describe('NIP helpers', () => {
  it('requires a NIP only for a company', () => {
    expect(isNipRequired('COMPANY')).toBe(true);
    expect(isNipRequired('INDIVIDUAL')).toBe(false);
    expect(isNipRequired(undefined)).toBe(false);
  });

  it('treats a missing or empty NIP as no value', () => {
    expect(hasNipValue(undefined)).toBe(false);
    expect(hasNipValue('')).toBe(false);
    expect(hasNipValue('   ')).toBe(false);
    expect(hasNipValue('8991234567')).toBe(true);
  });

  it('checks the format only for a string of the right length and shape', () => {
    expect(hasValidNipFormat('8991234567')).toBe(true);
    expect(hasValidNipFormat('123-456-78-90')).toBe(true);
    expect(hasValidNipFormat('123')).toBe(false);
    expect(hasValidNipFormat('899123456A')).toBe(false);
    expect(hasValidNipFormat(undefined)).toBe(false);
  });

  it('refuses an individual that carries a value, and accepts one that does not', () => {
    expect(isNipValid('INDIVIDUAL', undefined)).toBe(true);
    expect(isNipValid('INDIVIDUAL', '')).toBe(true);
    expect(isNipValid('INDIVIDUAL', '8991234567')).toBe(false);
  });

  it('accepts a company only with a well-formed value', () => {
    expect(isNipValid('COMPANY', '8991234567')).toBe(true);
    expect(isNipValid('COMPANY', '123')).toBe(false);
    expect(isNipValid('COMPANY', undefined)).toBe(false);
  });

  it('exposes the length bounds the messages quote', () => {
    expect(NIP_MIN_LENGTH).toBe(10);
    expect(NIP_MAX_LENGTH).toBe(15);
  });
});

describe('ClientNip constraint', () => {
  const constraint = new ClientNip();

  it('validates against the sibling type field', () => {
    expect(constraint.validate('8991234567', args({type: 'COMPANY'}))).toBe(true);
    expect(constraint.validate(undefined, args({type: 'COMPANY'}))).toBe(false);
    expect(constraint.validate('8991234567', args({type: 'INDIVIDUAL'}))).toBe(false);
    expect(constraint.validate(undefined, args({type: 'INDIVIDUAL'}))).toBe(true);
  });

  it('names the field in the message, and says which way it failed', () => {
    expect(constraint.defaultMessage(args({type: 'COMPANY'}))).toContain('NIP is required');
    expect(constraint.defaultMessage(args({type: 'INDIVIDUAL'}))).toContain('does not apply');
  });
});
