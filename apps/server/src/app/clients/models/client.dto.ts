import {CLIENT_TYPES, TClientType} from '@models/booking.model';
import * as Validator from 'class-validator';
import {ClientNip} from './client-nip.validator';

/**
 * The create payload for a client.
 *
 * It does not `implements Client`: the request body and the stored document are
 * deliberately different shapes. The document carries the audit timestamps, which are
 * server-owned, and `nick` is optional in the body but the stored record is what the
 * response is built from.
 */
export class ClientDto {
  @Validator.Length(3, 125)
  city!: string;

  @Validator.Length(3, 125)
  contactPerson!: string;

  @Validator.IsEmail()
  @Validator.Length(3, 125)
  email!: string;

  @Validator.Length(3, 125)
  name!: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  nick?: string;

  @Validator.Length(3, 15)
  phone!: string;

  @Validator.Length(3, 125)
  street!: string;

  @Validator.IsEnum(CLIENT_TYPES)
  type!: TClientType;

  @Validator.Length(6, 6)
  @Validator.Matches(/^[\d./-]+$/, {
    message: 'Zip code may only contain digits, dots, slashes and dashes'
  })
  zipCode!: string;

  /**
   * Required for a company, refused for an individual. No `@IsOptional` and no
   * `@ValidateIf`: both would skip the validator in exactly the case the rule exists to
   * catch — a company that sends no `nip` at all. The message comes from the
   * constraint's `defaultMessage`, so the rule and its wording live in one file.
   */
  @Validator.Validate(ClientNip)
  nip?: string;
}

/**
 * The update payload: every field optional, but still a class so the global pipe's
 * `whitelist`/`forbidNonWhitelisted` see a type.
 *
 * The controller previously took `Partial<ClientDto>`, a mapped type erased at runtime,
 * so the pipe saw `Object` and validated nothing. A concrete class is what makes the
 * field rules apply to this route.
 *
 * The NIP cross-field rule is not repeated here: a partial body may carry `nip` without
 * `type` or the reverse, so the rule is enforced on the *merged* document in
 * `ClientService.updateClient`, which is the only place both halves are visible.
 */
export class UpdateClientDto {
  @Validator.IsOptional()
  @Validator.Length(3, 125)
  city?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125)
  contactPerson?: string;

  @Validator.IsOptional()
  @Validator.IsEmail()
  @Validator.Length(3, 125)
  email?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125)
  name?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125)
  nick?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 15)
  phone?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125)
  street?: string;

  @Validator.IsOptional()
  @Validator.IsEnum(CLIENT_TYPES)
  type?: TClientType;

  @Validator.IsOptional()
  @Validator.Length(6, 6)
  @Validator.Matches(/^[\d./-]+$/, {
    message: 'Zip code may only contain digits, dots, slashes and dashes'
  })
  zipCode?: string;

  @Validator.IsOptional()
  @Validator.Length(10, 15, {
    message: 'NIP needs to be between 10 and 15 characters'
  })
  @Validator.Matches(/^[\d./-]+$/, {
    message: 'NIP may only contain digits, dots, slashes and dashes'
  })
  nip?: string;
}

