import {ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface} from 'class-validator';
import {TClientType} from '@models/booking.model';

/**
 * The NIP (tax id) rule, in one place because it is enforced twice: the DTO answers a
 * bad request with a field-level `422`, and the schema validator is the backstop for a
 * write that never passes through the DTO (a seed or a migration). Two copies of the
 * rule would drift, and a drift here stores a company with no tax id.
 *
 * Legacy `ClientForm` rendered the field only for a company and required it there
 * (10–15 characters, `^[\d./-]+$`); an individual's form never sent one. The form also
 * submitted `nip: cred.nip || ''`, so an individual arrives with an empty string rather
 * than no key at all — an empty value therefore counts as absent.
 */
export const NIP_PATTERN = /^[\d./-]+$/;
export const NIP_MIN_LENGTH = 10;
export const NIP_MAX_LENGTH = 15;

export function isNipRequired(type: TClientType | undefined): boolean {
  return type === 'COMPANY';
}

export function hasNipValue(nip: unknown): boolean {
  return typeof nip === 'string' && nip.trim().length > 0;
}

/** The shape a NIP must have when one is supplied. */
export function hasValidNipFormat(nip: unknown): boolean {
  return (
    typeof nip === 'string' &&
    nip.length >= NIP_MIN_LENGTH &&
    nip.length <= NIP_MAX_LENGTH &&
    NIP_PATTERN.test(nip)
  );
}

/**
 * Whether `nip` is acceptable for `type`.
 *
 * An individual with a value is refused rather than quietly ignored: silently dropping
 * input is how a user comes to believe a tax id was saved when it was not.
 */
export function isNipValid(type: TClientType | undefined, nip: unknown): boolean {
  return isNipRequired(type) ? hasValidNipFormat(nip) : !hasNipValue(nip);
}

/**
 * Attached to `nip`, not to `type`, so the error is reported against the field the
 * caller must change.
 *
 * It carries no `@IsOptional()`: that decorator skips *every* validator on the property
 * when the value is absent, which is exactly the case the rule must catch — a company
 * with no `nip` at all. For the same reason it is the only validator on the property;
 * `@ValidateIf` would skip the rest, and a conditional and an unconditional validator
 * cannot share a property.
 */
@ValidatorConstraint({name: 'clientNip', async: false})
export class ClientNip implements ValidatorConstraintInterface {
  validate(nip: unknown, args: ValidationArguments): boolean {
    const {type} = args.object as {type?: TClientType};
    return isNipValid(type, nip);
  }

  defaultMessage(args: ValidationArguments): string {
    const {type} = args.object as {type?: TClientType};
    return isNipRequired(type)
      ? `NIP is required for a company (${NIP_MIN_LENGTH}–${NIP_MAX_LENGTH} characters, digits, dots, slashes and dashes).`
      : 'NIP does not apply to an individual client.';
  }
}
