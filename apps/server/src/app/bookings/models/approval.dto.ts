import * as Validator from 'class-validator';

/**
 * The body of `POST /bookings/{_id}/approve` (contracts/openapi.yaml).
 *
 * `force` is optional and defaults to false: an approval that would keep a conflict
 * is refused with `409` unless the administrator explicitly confirms it. It is a
 * concrete class rather than a `Partial<...>`, so the global `ValidationPipe` sees a
 * type and enforces `whitelist`/`forbidNonWhitelisted` — a mapped type is erased at
 * runtime and would let an unknown property through.
 */
export class ApprovalDto {
  @Validator.IsBoolean({
    message: 'Accepted value need to be boolean type.'
  })
  accepted!: boolean;

  @Validator.IsOptional()
  @Validator.IsBoolean({
    message: 'Force value need to be boolean type.'
  })
  force?: boolean;
}
