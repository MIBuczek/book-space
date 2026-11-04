import {ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments} from 'class-validator';
import {TClientType} from '@models/booking.model';

/**
 * The NIP rule for a client, which depends on the sibling `type` field (T008, FR-025).
 *
 * It cannot be expressed with the single-property decorators: `@IsNotEmpty` cannot be
 * conditional on another field, and `@ValidateIf` on the same property as the value
 * decorators applies to *all* of them — two `@ValidateIf` on one property (one for
 * COMPANY, one for INDIVIDUAL) would skip each other and validate nothing. A constraint
 * that reads `args.object` expresses both branches and the two messages in one place.
 *
 * The rule is: a company must carry a non-empty NIP; an individual must not carry one.
 * A missing `type` is left to the field's own `@IsEnum` to reject, so this returns true
 * for an unrecognised type rather than producing a second message for the same problem.
 */
@ValidatorConstraint({name: 'nipForClientType', async: false})
export class NipForClientType implements ValidatorConstraintInterface {
  validate(nip: unknown, args: ValidationArguments): boolean {
    const {type} = args.object as {type?: TClientType};

    if (type === 'COMPANY') {
      return typeof nip === 'string' && nip.trim().length > 0;
    }
    if (type === 'INDIVIDUAL') {
      return nip === undefined || nip === null || nip === '';
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const {type} = args.object as {type?: TClientType};
    return type === 'COMPANY'
      ? 'NIP is required for a company'
      : 'NIP must not be set for an individual';
  }
}
