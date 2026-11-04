import {ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments} from 'class-validator';

/**
 * Confirms that `endHours` is strictly after `startHours` (FR-012).
 *
 * This is a cross-field rule, so it cannot be expressed with the single-property
 * decorators: `@Min` compares against a constant, and the value to compare against is a
 * sibling field. The legacy application validated this in the browser only
 * (`BookingTimeStatusForm`), so a crafted payload could store an inverted interval.
 *
 * An absent or non-`Date` value is left to `@IsDate` to reject, so this only compares
 * two real instants; returning `true` for anything else keeps a single, clear error per
 * problem rather than two messages for the same malformed field.
 */
@ValidatorConstraint({name: 'afterStartHours', async: false})
export class AfterStartHours implements ValidatorConstraintInterface {
  validate(endHours: unknown, args: ValidationArguments): boolean {
    const {startHours} = args.object as {startHours?: unknown};
    if (!(endHours instanceof Date) || !(startHours instanceof Date)) {
      return true;
    }
    return endHours.getTime() > startHours.getTime();
  }

  defaultMessage(): string {
    return 'End hours need to be after start hours';
  }
}
