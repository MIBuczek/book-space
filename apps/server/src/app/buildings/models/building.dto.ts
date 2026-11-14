import * as Validator from 'class-validator';
import {SIZES, TSize} from '@models/building.model';

/**
 * The payload for creating a facility (contracts/openapi.yaml `BuildingDto`).
 *
 * `property` and `sizes` are required: `property` is what a booking references, and a
 * facility with no rentable size cannot be booked. `city` is free text (spec.md §9 open
 * question 1, FR-007): cities are data, so the DTO bounds the length rather than restricting
 * the value to a compiled-in list. The uniqueness of `{city, property}` is enforced by the
 * schema index rather than here, because a DTO cannot see the other records.
 *
 * It does not `implements Building`: `lighting`, `toilets` and `employees` carry schema
 * defaults and are optional in the contract, and a class property declared optional is not
 * assignable to the schema class's required property.
 */
export class BuildingDto {
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  name!: string;

  @Validator.IsString({message: 'Property need to be a string.'})
  @Validator.IsNotEmpty({message: 'Property need to be filled.'})
  property!: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  email!: string;

  @Validator.Length(3, 15, {
    message: 'Number of characters need to be between 3 and 15'
  })
  phone!: string;

  @Validator.IsString({message: 'City need to be a string.'})
  @Validator.Length(2, 125, {
    message: 'Number of characters need to be between 2 and 125'
  })
  city!: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  street?: string;

  @Validator.IsOptional()
  @Validator.Length(6, 6, {
    message: 'Number of characters need to be exactly 6'
  })
  zipCode?: string;

  @Validator.ArrayMinSize(1, {
    message: 'At least one rentable size need to be added'
  })
  @Validator.IsIn(SIZES, {each: true, message: 'Size must be one of 1/1, 1/2, 1/3, 2/3, 1/4, 3/4.'})
  sizes!: TSize[];

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Lighting must be true or false.'})
  lighting?: boolean;

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Toilets must be true or false.'})
  toilets?: boolean;

  @Validator.IsOptional()
  @Validator.IsArray({message: 'Employees must be a list of names.'})
  @Validator.IsString({each: true, message: 'Every employee must be a name.'})
  employees?: string[];

  /** Whether the facility is active (T059). Optional on create, defaulting to active. */
  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Active must be true or false.'})
  active?: boolean;
}

/**
 * The payload for updating a facility: every field optional, but a concrete class so the
 * global `ValidationPipe` still validates it. `Partial<BuildingDto>` is a *type*, erased at
 * runtime, so the pipe would see `Object` and validate nothing.
 */
export class UpdateBuildingDto {
  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  name?: string;

  @Validator.IsOptional()
  @Validator.IsString({message: 'Property need to be a string.'})
  @Validator.IsNotEmpty({message: 'Property need to be filled.'})
  property?: string;

  @Validator.IsOptional()
  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  email?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 15, {
    message: 'Number of characters need to be between 3 and 15'
  })
  phone?: string;

  @Validator.IsOptional()
  @Validator.IsString({message: 'City need to be a string.'})
  @Validator.Length(2, 125, {
    message: 'Number of characters need to be between 2 and 125'
  })
  city?: string;

  @Validator.IsOptional()
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  street?: string;

  @Validator.IsOptional()
  @Validator.Length(6, 6, {
    message: 'Number of characters need to be exactly 6'
  })
  zipCode?: string;

  @Validator.IsOptional()
  @Validator.ArrayMinSize(1, {
    message: 'At least one rentable size need to be added'
  })
  @Validator.IsIn(SIZES, {each: true, message: 'Size must be one of 1/1, 1/2, 1/3, 2/3, 1/4, 3/4.'})
  sizes?: TSize[];

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Lighting must be true or false.'})
  lighting?: boolean;

  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Toilets must be true or false.'})
  toilets?: boolean;

  @Validator.IsOptional()
  @Validator.IsArray({message: 'Employees must be a list of names.'})
  @Validator.IsString({each: true, message: 'Every employee must be a name.'})
  employees?: string[];

  /** Deactivates (`false`) or reactivates (`true`) a facility (T059). */
  @Validator.IsOptional()
  @Validator.IsBoolean({message: 'Active must be true or false.'})
  active?: boolean;
}
