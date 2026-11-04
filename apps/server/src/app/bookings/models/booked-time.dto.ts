import {IBookedTime} from '@models/booked-time.model';
import {BOOKING_STATUSES, TSingleBookingStatus} from '@models/booked-time.model';
import * as Validator from 'class-validator';
import {AfterStartHours} from './after-start-hours.validator';

/**
 * One time slot in a request body.
 *
 * `implements IBookedTime` rather than the schema class: the shared model is the single
 * source of truth for the payload (constitution, Principle IV), and it is where
 * `participants` and `comments` are declared optional. They are optional here for the
 * same reason — `contracts/openapi.yaml` lists only `day`, `startHours`, `endHours` and
 * `status` as required, and an unresolved slot legitimately carries neither.
 *
 * That distinction only became observable when `PUT /bookings/{_id}/booked-times` started
 * validating its array body: before `ParseArrayPipe` was attached, a top-level array was
 * never checked, so a required field here rejected nothing. Once it does, a slot without
 * `participants`/`comments` would be refused — a payload the contract allows and the
 * data model describes.
 */
export class BookedTimeDto implements IBookedTime {
  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  day!: Date;

  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  startHours!: Date;

  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  @Validator.Validate(AfterStartHours)
  endHours!: Date;

  @Validator.IsEnum(BOOKING_STATUSES, {
    message: 'Status state can be only initial, done, canceled.'
  })
  status!: TSingleBookingStatus;

  @Validator.IsOptional()
  @Validator.IsInt({
    message: 'Value need to be integer.'
  })
  @Validator.Min(0, {
    message: 'Minimal value of participants can not be lower then 0.'
  })
  @Validator.Max(50, {
    message: 'Minimal value of participants can not be higher then 50.'
  })
  participants?: number;

  @Validator.IsOptional()
  @Validator.MaxLength(525, {
    message: 'Comments can have maximal 525 characters'
  })
  comments?: string;
}
