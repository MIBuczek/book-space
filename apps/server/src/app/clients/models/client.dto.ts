import {CLIENT_TYPES, TClientType} from '@models/booking.model';
import * as Validator from 'class-validator';
import {NipForClientType} from './nip-for-client-type.validator';

/**
 * The payload for creating a client (T008, `contracts/openapi.yaml` `ClientDto`).
 *
 * It does not `implements Client`: the request body and the stored document are
 * deliberately different shapes. `createdAt`/`updatedAt` are server-owned audit fields,
 * and a class property declared required here would force a caller to supply them.
 *
 * The NIP rule is `COMPANY`-conditional and lives in `NipForClientType`, which reads the
 * sibling `type` field — a single-property decorator cannot see it.
 */
export class ClientDto {
  @Validator.IsEnum(CLIENT_TYPES, {
    message: 'Type must be one of INDIVIDUAL, COMPANY.'
  })
  type!: TClientType;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  name!: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  nick?: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  contactPerson!: string;

  @Validator.Length(3, 15, {
    message: 'Number of characters need to be between 3 and 15'
  })
  phone!: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  email!: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  street!: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  city!: string;

  @Validator.Length(6, 6, {
    message: 'Postal code must be exactly 6 characters'
  })
  @Validator.Matches(/^[\d./-]+$/, {
    message: 'Postal code may contain only digits, dot, slash and hyphen'
  })
  zipCode!: string;

  // No `@IsOptional()`: it would skip the constraint when `nip` is absent, which is
  // exactly the case the rule has to catch for a company. The constraint itself allows
  // an absent value for an individual, so `@IsOptional` is not needed to express that.
  @Validator.Validate(NipForClientType)
  nip?: string;
}

/**
 * The payload for updating a client: every field optional, but a concrete class so the
 * global `ValidationPipe` still validates it. `Partial<ClientDto>` is a *type*, erased at
 * runtime, so the pipe would see `Object` and validate nothing.
 *
 * The `COMPANY`/`INDIVIDUAL` NIP rule is not enforced here: an update may carry neither
 * `type` nor `nip`, and a partial body cannot see the stored document. The schema's
 * `pre('validate')` hook and the service are the controls for that case.
 */
export class UpdateClientDto {
  @Validator.IsOptional()
  @Validator.IsEnum(CLIENT_TYPES, {
    message: 'Type must be one of INDIVIDUAL, COMPANY.'
  })
  type?: TClientType;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  name?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  nick?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  contactPerson?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 15, {
    message: 'Number of characters need to be between 3 and 15'
  })
  phone?: string;

  @Validator.IsOptional()
  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  email?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  street?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  city?: string;

  @Validator.IsOptional()
  @Validator.Length(6, 6, {
    message: 'Postal code must be exactly 6 characters'
  })
  @Validator.Matches(/^[\d./-]+$/, {
    message: 'Postal code may contain only digits, dot, slash and hyphen'
  })
  zipCode?: string;

  @Validator.IsOptional()
  @Validator.IsString({message: 'NIP must be a string'})
  @Validator.Matches(/^[\d-]+$/, {message: 'NIP may contain only digits and hyphens'})
  nip?: string;
}
