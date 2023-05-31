import {TClientType, IPlace, TPayment} from '@models/booking.model';
import {BookedTime, TBookedTime} from '../schemas/booked-time.schemta';
import {Booking} from '../schemas/booking.schema';
import * as Validator from 'class-validator';

export class BookingDto implements Booking {
  @Validator.IsEnum(['INDIVIDUAL', 'COMPANY'], {
    message: 'Client type can be only individual or company.'
  })
  type: TClientType;

  @Validator.IsObject({
    message: 'City and street information need to be added.'
  })
  place: IPlace;

  @Validator.Length(3, 3, {
    message: 'Size has strict string pattern X/X'
  })
  size: string;

  @Validator.Length(9, 20, {
    message: 'Client id need to be between 9 to 20 characters.'
  })
  clientId: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  personName: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  personCompany: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  personEmail: string;

  @Validator.Length(9, 15, {
    message: 'Number of characters need to be between 9 and 15'
  })
  personPhone: string;

  @Validator.IsInt({
    message: 'Value need to be integer.'
  })
  @Validator.Min(0, {
    message: 'Minimal value can not be lower then 1.'
  })
  @Validator.Max(11, {
    message: 'Minimal value can not be lower then 12.'
  })
  month: number;

  @Validator.ArrayMinSize(1, {
    message: 'At least one booked time need to be added.'
  })
  bookedTimes: TBookedTime[];

  @Validator.IsBoolean({
    message: 'Value need to be boolean type.'
  })
  accepted: boolean;

  @Validator.Length(3, 525, {
    message: 'Number of characters need to be between 3 and 525'
  })
  comments: string;

  @Validator.IsEnum(['CASH', 'TRANSFER', 'CARD'], {
    message: 'Payment method can be only cash, transfer or card.'
  })
  paymentMethod: TPayment;

  @Validator.IsBoolean({
    message: 'Value need to be boolean type.'
  })
  archive: boolean;
}
