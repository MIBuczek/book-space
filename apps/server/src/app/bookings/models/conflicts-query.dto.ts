import * as Validator from 'class-validator';

/**
 * The query for `GET /bookings/conflicts` (contracts/openapi.yaml).
 *
 * All three are required: a conflict is only meaningful for one facility in one
 * month, and a request that omitted the month would silently compare bookings that
 * the rules never compare. `month` arrives as a string on the query string; the
 * global pipe runs with `enableImplicitConversion`, so the `number` type is what
 * converts it, and `@IsInt` then rejects a non-integer.
 */
export class ConflictsQueryDto {
  @Validator.IsString({
    message: 'City is required.'
  })
  @Validator.IsNotEmpty({
    message: 'City is required.'
  })
  city!: string;

  @Validator.IsString({
    message: 'Building is required.'
  })
  @Validator.IsNotEmpty({
    message: 'Building is required.'
  })
  building!: string;

  @Validator.IsInt({
    message: 'Month need to be integer.'
  })
  @Validator.Min(0, {
    message: 'Month can not be lower than 0.'
  })
  @Validator.Max(11, {
    message: 'Month can not be higher than 11.'
  })
  month!: number;
}
