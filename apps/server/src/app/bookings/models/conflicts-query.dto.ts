import * as Validator from 'class-validator';
import {Type} from 'class-transformer';

/**
 * The query for `GET /bookings/conflicts` (contracts/openapi.yaml).
 *
 * All four are required: a conflict is only meaningful for one facility over one
 * period, and a request that omitted a bound would silently compare bookings the rules
 * never compare.
 *
 * The period is two dates, not a 0-based `month` index (T054). The scalar `month` on the
 * booking is derived from its first slot, so a month index is ambiguous the moment a
 * booking crosses a boundary — and it is exactly the field this task stops scoping on.
 * Dates match the convention `GET /bookings` (`from`/`to`) and the reporting period
 * filter (`fromMonth`/`toMonth`) already use. `@Type(() => Date)` converts the query
 * strings; without it `@IsDate` would reject every request, and an unparsable value
 * becomes an `Invalid Date` that `@IsDate` still rejects.
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

  @Type(() => Date)
  @Validator.IsDate({
    message: 'From need to be a valid date.'
  })
  from!: Date;

  @Type(() => Date)
  @Validator.IsDate({
    message: 'To need to be a valid date.'
  })
  to!: Date;
}
