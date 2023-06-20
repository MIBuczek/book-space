import {TClientType, IPlace, TPayment} from '@models/booking.model';
import {TBookedTime} from '../schemas/booked-time.schemta';
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
    message: 'Size has strict string pattern X/X.'
  })
  size: string;

  @Validator.Length(9, 50, {
    message: 'Client id need to be between 9 to 50 characters.'
  })
  clientId: string;

  @Validator.Length(3, 125, {
    message: 'Person name can have between 3 and 125 characters.'
  })
  personName: string;

  @Validator.MaxLength(125, {
    message: 'Person company can have maximal 125 characters.'
  })
  personCompany: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern.'
  })
  @Validator.Length(3, 125, {
    message: 'Person e- mail can have between 3 and 125 characters.'
  })
  personEmail: string;

  @Validator.Length(9, 15, {
    message: 'Person phone can have between 9 and 15 characters.'
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
    message: 'Accepted value need to be boolean type.'
  })
  accepted: boolean;

  @Validator.MaxLength(525, {
    message: 'Comments can have maximal 525 characters.'
  })
  comments: string;

  @Validator.IsEnum(['CASH', 'TRANSFER', 'CARD'], {
    message: 'Payment method can be only cash, transfer or card.'
  })
  paymentMethod: TPayment;

  @Validator.IsBoolean({
    message: 'Archive value need to be boolean type.'
  })
  archive: boolean;
}
