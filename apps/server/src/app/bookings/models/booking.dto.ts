import {CLIENT_TYPES, PAYMENTS, TClientType, IPlace, TPayment} from '@models/booking.model';
import {TBookedTime} from '../schemas/booked-time.schemta';
import {SelectedExtraOptionDto} from './selected-extra-option.dto';
import {Type} from 'class-transformer';
import * as Validator from 'class-validator';

/**
 * The body of `POST /bookings` (contracts/openapi.yaml `BookingDto`).
 *
 * `extraOptions` is deliberately not declared: it is *derived* — true when `selectedOptions`
 * is non-empty (data-model.md) — so a caller-supplied value would be a second source of
 * truth for the same fact. The service computes it from `selectedOptions`.
 *
 * The audit fields (`createdBy`/`createdAt`/`modifiedBy`/`modifiedAt`) are absent for a
 * stronger reason: they are stamped by the server from the authenticated actor (FR-016), and
 * a body that could set them would let a caller attribute a booking to someone else.
 * `whitelist`/`forbidNonWhitelisted` rejects them.
 *
 * The class no longer `implements Booking`: the schema now carries server-owned fields
 * (`extraOptions`, the audit stamps) that the request body must not, so the interface and
 * the DTO are deliberately different shapes. `building.dto.ts` dropped the same clause for
 * the same reason.
 */
export class BookingDto {
  @Validator.IsEnum(CLIENT_TYPES, {
    message: 'Client type can be only individual or company.'
  })
  type!: TClientType;

  @Validator.IsObject({
    message: 'City and street information need to be added.'
  })
  place!: IPlace;

  @Validator.Length(3, 3, {
    message: 'Size has strict string pattern X/X.'
  })
  size!: string;

  @Validator.IsOptional()
  @Validator.Length(9, 50, {
    message: 'Client id need to be between 9 to 50 characters.'
  })
  clientId?: string;

  @Validator.Length(3, 100, {
    message: 'Booking nick can have between 3 and 100 characters.'
  })
  nick!: string;

  @Validator.Length(3, 125, {
    message: 'Person name can have between 3 and 125 characters.'
  })
  personName!: string;

  @Validator.IsOptional()
  @Validator.MaxLength(125, {
    message: 'Person company can have maximal 125 characters.'
  })
  personCompany?: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern.'
  })
  @Validator.Length(3, 125, {
    message: 'Person e- mail can have between 3 and 125 characters.'
  })
  personEmail!: string;

  @Validator.Length(9, 15, {
    message: 'Person phone can have between 9 and 15 characters.'
  })
  personPhone!: string;

  @Validator.IsInt({
    message: 'Value need to be integer.'
  })
  @Validator.Min(0, {
    message: 'Minimal value can not be lower then 1.'
  })
  @Validator.Max(11, {
    message: 'Minimal value can not be lower then 12.'
  })
  month!: number;

  @Validator.ArrayMinSize(1, {
    message: 'At least one booked time need to be added.'
  })
  bookedTimes!: TBookedTime[];

  @Validator.IsBoolean({
    message: 'Accepted value need to be boolean type.'
  })
  accepted!: boolean;

  @Validator.IsOptional()
  @Validator.MaxLength(525, {
    message: 'Comments can have maximal 525 characters.'
  })
  comments?: string;

  @Validator.IsEnum(PAYMENTS, {
    message: 'Payment method can be only cash, transfer or free.'
  })
  paymentMethod!: TPayment;

  @Validator.IsOptional()
  @Validator.Matches(/^[0-9]{1,3}%$/, {
    message: 'Discount must be a percentage such as 10%.'
  })
  discount?: string;

  @Validator.IsOptional()
  @Validator.IsArray({
    message: 'Selected options need to be a list.'
  })
  @Validator.ValidateNested({each: true})
  @Type(() => SelectedExtraOptionDto)
  selectedOptions?: SelectedExtraOptionDto[];

  @Validator.IsBoolean({
    message: 'Archive value need to be boolean type.'
  })
  archive!: boolean;
}
