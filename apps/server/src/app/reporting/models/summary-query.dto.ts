import * as Validator from 'class-validator';
import {Transform, Type} from 'class-transformer';

/**
 * The query for `GET /reporting/summary` and `GET /reporting/summary.csv`
 * (contracts/openapi.yaml, FR-027–FR-029).
 *
 * `clientId` is required for the single-client summary; the all-clients CSV omits it. The
 * controller decides which is required per route, because the two routes share this shape and
 * only one of them accepts a missing client.
 *
 * `fromMonth`/`toMonth` are converted to `Date` and checked with `@IsDate`, exactly as
 * `BookingQueryDto` does — without the conversion a query string is a string and `@IsDate`
 * rejects every request, and a malformed value becomes an `Invalid Date` that is still
 * rejected. `fromTheBeginning` needs `@BooleanQuery()` rather than a bare `@IsBoolean`, for
 * the same reason: the global pipe's `enableImplicitConversion` coerces with `Boolean(value)`
 * and `Boolean('false')` is `true`.
 */
const BooleanQuery = (): PropertyDecorator =>
  Transform(({obj, key}) => {
    const raw = (obj as Record<string, unknown>)[key as string];
    return raw === undefined ? undefined : raw === true || raw === 'true';
  });

export class SummaryQueryDto {
  @Validator.IsOptional()
  @Validator.IsString({
    message: 'Client id need to be a string.'
  })
  clientId?: string;

  @Validator.IsOptional()
  @Type(() => Date)
  @Validator.IsDate({
    message: 'From month need to be a valid date.'
  })
  fromMonth?: Date;

  @Validator.IsOptional()
  @Type(() => Date)
  @Validator.IsDate({
    message: 'To month need to be a valid date.'
  })
  toMonth?: Date;

  @Validator.IsOptional()
  @BooleanQuery()
  @Validator.IsBoolean({
    message: 'From the beginning value need to be boolean type.'
  })
  fromTheBeginning?: boolean;
}
