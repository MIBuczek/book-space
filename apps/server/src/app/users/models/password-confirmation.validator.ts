import {ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments} from 'class-validator';

/**
 * Confirms that `recheckPassword` repeats `password`.
 *
 * This is a cross-field rule, so it cannot be expressed with the single-property
 * decorators: `@Equals` compares against a constant, and the value to compare
 * against is a sibling field. Without this the confirmation field was decorative —
 * declared on the DTO but never read, so a typo in the confirmation was accepted.
 */
@ValidatorConstraint({name: 'passwordConfirmation', async: false})
export class PasswordConfirmation implements ValidatorConstraintInterface {
  validate(recheckPassword: unknown, args: ValidationArguments): boolean {
    const {password} = args.object as {password?: unknown};
    return recheckPassword === password;
  }

  defaultMessage(): string {
    return 'Passwords not match each other';
  }
}
