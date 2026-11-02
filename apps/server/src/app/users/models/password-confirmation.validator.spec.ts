import {ValidationArguments} from 'class-validator';
import {PasswordConfirmation} from './password-confirmation.validator';

/**
 * The rule is exercised through `UserDto` in the DTO spec, which is where it
 * matters. This spec covers the parts the decorator path does not reach: the
 * validator used directly, and the message it falls back to when the decorator
 * does not override it.
 */
describe('PasswordConfirmation', () => {
  const validator = new PasswordConfirmation();

  const argsFor = (object: Record<string, unknown>) => ({object}) as ValidationArguments;

  it('accepts a confirmation that repeats the password', () => {
    const args = argsFor({password: 'correct horse battery'});

    expect(validator.validate('correct horse battery', args)).toBe(true);
  });

  it('rejects a confirmation that differs from the password', () => {
    const args = argsFor({password: 'correct horse battery'});

    expect(validator.validate('something else', args)).toBe(false);
  });

  it('rejects a confirmation when there is no password to compare against', () => {
    expect(validator.validate('correct horse battery', argsFor({}))).toBe(false);
  });

  it('rejects an undefined confirmation', () => {
    expect(validator.validate(undefined, argsFor({password: 'correct horse battery'}))).toBe(false);
  });

  it('reports a message naming the mismatch', () => {
    expect(validator.defaultMessage()).toMatch(/match/i);
  });
});
