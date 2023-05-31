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
    message: 'Minimal value can not be lower then 0.'
  })
  @Validator.Max(50, {
    message: 'Minimal value can not be lower then 50.'
  })
  participants: string;

  @Validator.Length(3, 525, {
    message: 'Number of characters need to be between 3 and 525'
  })
  comments: string;
}
