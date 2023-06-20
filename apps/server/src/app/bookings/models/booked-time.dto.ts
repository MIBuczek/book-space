import {BookedTime} from '@server/bookings/schemas/booked-time.schemta';
import {TSingleBookingStatus} from '@models/booked-time.model';
import * as Validator from 'class-validator';

export class BookedTimeDto implements BookedTime {
  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  day: Date;

  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  startHours: Date;

  @Validator.IsDate({
    message: 'Value need to be Date type.'
  })
  endHours: Date;

  @Validator.IsEnum(['INITIAL', 'DONE', 'CANCELED'], {
    message: 'Status state can be only initial, done, canceled.'
  })
  status: TSingleBookingStatus;

  @Validator.IsInt({
    message: 'Value need to be integer.'
  })
  @Validator.Min(0, {
    message: 'Minimal value of participants can not be lower then 0.'
  })
  @Validator.Max(50, {
    message: 'Minimal value of participants can not be higher then 50.'
  })
  participants: number;

  @Validator.MaxLength(525, {
    message: 'Comments can have maximal 525 characters'
  })
  comments: string;
}
