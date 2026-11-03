import * as Validator from 'class-validator';

/**
 * The body of `POST /bookings/{_id}/archive` (contracts/openapi.yaml).
 *
 * A concrete class, so the global pipe validates it rather than seeing `Object`.
 */
export class ArchiveDto {
  @Validator.IsBoolean({
    message: 'Archive value need to be boolean type.'
  })
  archive!: boolean;
}
