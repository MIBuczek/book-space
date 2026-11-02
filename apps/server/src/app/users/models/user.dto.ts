import {User} from '../schemas/user.schema';
import * as Validator from 'class-validator';
import {USER_ROLES, TUserRole} from '@models/user.model';
import {PasswordConfirmation} from './password-confirmation.validator';

/**
 * The payload for creating a user.
 *
 * `role` is required rather than defaulted: a default would turn the omission of
 * the field into a silent privilege decision. `city` is required for every role
 * except `ADMIN`, because a non-administrator is scoped to a facility and a missing
 * city would leave that scope undefined — which the authorisation checks would then
 * have to read as either "all cities" or "no cities", and both are wrong.
 */
export class UserDto implements Pick<User, 'firstName' | 'lastName' | 'password' | 'email' | 'role'> {
  @Validator.MinLength(3, {
    message: 'Minimal number of characters is 3.'
  })
  @Validator.MaxLength(125, {
    message: 'Maximal number of characters is 125.'
  })
  firstName!: string;

  @Validator.MinLength(3, {
    message: 'Minimal number of characters is 3.'
  })
  @Validator.MaxLength(125, {
    message: 'Maximal number of characters is 125.'
  })
  lastName!: string;

  @Validator.MinLength(6, {
    message: 'Minimal number of characters is 6.'
  })
  @Validator.MaxLength(30, {
    message: 'Maximal number of characters is 30.'
  })
  password!: string;

  @Validator.Validate(PasswordConfirmation, {message: 'Passwords not match each other'})
  recheckPassword!: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern.'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125.'
  })
  email!: string;

  @Validator.IsIn(USER_ROLES, {
    message: 'Role must be one of ADMIN, OFFICE, EMPLOYEE.'
  })
  role!: TUserRole;

  // Conditionally required. `ValidateIf` skips every other validator on the field
  // when the role is ADMIN, so an administrator may omit it; for any other role the
  // value must be a non-empty string.
  @Validator.ValidateIf((o: UserDto) => o.role !== 'ADMIN')
  @Validator.IsString({message: 'City is required for every role except ADMIN.'})
  @Validator.IsNotEmpty({message: 'City is required for every role except ADMIN.'})
  city?: string;

  @Validator.IsOptional()
  @Validator.IsArray({message: 'Buildings must be a list of property keys.'})
  @Validator.IsString({each: true, message: 'Every building must be a property key.'})
  buildings?: string[];

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Active must be true or false.'})
  active?: boolean;
}

/**
 * The payload for updating a user: every field optional, but still a class so the
 * global `ValidationPipe` validates it.
 *
 * This exists because the route previously took `Partial<UserDto>`. That is a
 * *type*, erased at runtime, so the pipe saw `Object` and validated nothing — a
 * body with an unknown key, a short password or a bad role was passed straight to
 * the service. A concrete class is what makes `whitelist` and
 * `forbidNonWhitelisted` apply to this route.
 *
 * Written by hand rather than via `PartialType` from `@nestjs/mapped-types`: that
 * package is not a dependency, and one small class is not worth adding one.
 */
export class UpdateUserDto {
  @Validator.IsOptional()
  @Validator.MinLength(3, {message: 'Minimal number of characters is 3.'})
  @Validator.MaxLength(125, {message: 'Maximal number of characters is 125.'})
  firstName?: string;

  @Validator.IsOptional()
  @Validator.MinLength(3, {message: 'Minimal number of characters is 3.'})
  @Validator.MaxLength(125, {message: 'Maximal number of characters is 125.'})
  lastName?: string;

  @Validator.IsOptional()
  @Validator.MinLength(6, {message: 'Minimal number of characters is 6.'})
  @Validator.MaxLength(30, {message: 'Maximal number of characters is 30.'})
  password?: string;

  @Validator.Validate(PasswordConfirmation, {message: 'Passwords not match each other'})
  recheckPassword?: string;

  @Validator.IsOptional()
  @Validator.IsEmail(undefined, {message: 'E-mail address need to contains correct pattern.'})
  email?: string;

  @Validator.IsOptional()
  @Validator.IsIn(USER_ROLES, {message: 'Role must be one of ADMIN, OFFICE, EMPLOYEE.'})
  role?: TUserRole;

  @Validator.IsOptional()
  @Validator.IsString({message: 'City must be a string.'})
  @Validator.IsNotEmpty({message: 'City cannot be empty.'})
  city?: string;

  @Validator.IsOptional()
  @Validator.IsArray({message: 'Buildings must be a list of property keys.'})
  @Validator.IsString({each: true, message: 'Every building must be a property key.'})
  buildings?: string[];

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Active must be true or false.'})
  active?: boolean;
}
