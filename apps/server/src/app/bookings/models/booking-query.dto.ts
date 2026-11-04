import * as Validator from 'class-validator';
import {Transform, Type} from 'class-transformer';

/**
 * The query for `GET /bookings` (contracts/openapi.yaml, FR-020, FR-022, FR-043).
 *
 * Every field is optional: the route decides what a missing bound means, because that
 * differs by caller (an anonymous request must name a period; staff get the current
 * academic year). See `bookings/list/booking-list.ts`.
 *
 * `from`/`to` are converted to `Date` with `@Type(() => Date)` and then checked with
 * `@IsDate`. Without the conversion a query string arrives as a string and `@IsDate`
 * rejects every request; with it, an unparsable value becomes an `Invalid Date` and
 * `@IsDate` still rejects it, so both a missing and a malformed bound are a `422`.
 *
 * `accepted` and `archive` need `@BooleanQuery()` and not a bare `@IsBoolean()`. The
 * global pipe runs with `enableImplicitConversion`, which coerces a query string with
 * `Boolean(value)` — and `Boolean('false')` is `true`, so `?archive=false` would ask for
 * the archived records. The transform reads the raw query value (the `obj` the callback
 * receives, before conversion) and only `true`/`'true'` become `true`; every other value
 * is `false`. Without the transform the flag silently inverts, which is the kind of
 * defect that looks like a working filter.
 */
const BooleanQuery = (): PropertyDecorator =>
  Transform(({obj, key}) => {
    const raw = (obj as Record<string, unknown>)[key as string];
    return raw === undefined ? undefined : raw === true || raw === 'true';
  });

export class BookingQueryDto {
  @Validator.IsOptional()
  @Type(() => Date)
  @Validator.IsDate({
    message: 'From need to be a valid date.'
  })
  from?: Date;

  @Validator.IsOptional()
  @Type(() => Date)
  @Validator.IsDate({
    message: 'To need to be a valid date.'
  })
  to?: Date;

  @Validator.IsOptional()
  @Validator.IsString({
    message: 'City need to be a string.'
  })
  city?: string;

  @Validator.IsOptional()
  @Validator.IsString({
    message: 'Building need to be a string.'
  })
  building?: string;

  @Validator.IsOptional()
  @BooleanQuery()
  @Validator.IsBoolean({
    message: 'Accepted value need to be boolean type.'
  })
  accepted?: boolean;

  @Validator.IsOptional()
  @BooleanQuery()
  @Validator.IsBoolean({
    message: 'Archive value need to be boolean type.'
  })
  archive?: boolean;

  @Validator.IsOptional()
  @Validator.IsString({
    message: 'Client id need to be a string.'
  })
  clientId?: string;

  @Validator.IsOptional()
  @Validator.IsInt({
    message: 'Page need to be an integer.'
  })
  @Validator.Min(1, {
    message: 'Page can not be lower than 1.'
  })
  page?: number;

  @Validator.IsOptional()
  @Validator.IsInt({
    message: 'Limit need to be an integer.'
  })
  @Validator.Min(1, {
    message: 'Limit can not be lower than 1.'
  })
  @Validator.Max(200, {
    message: 'Limit can not be higher than 200.'
  })
  limit?: number;

  /**
   * Staff-only: load every record rather than the default academic year. The controller
   * refuses it for a public caller; the route treats an unmarked request as public, so
   * an anonymous `?all=true` cannot widen the read.
   */
  @Validator.IsOptional()
  @BooleanQuery()
  @Validator.IsBoolean({
    message: 'All value need to be boolean type.'
  })
  all?: boolean;
}
