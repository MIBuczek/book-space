import {Client} from '../schemas/client.schema';
import {TClientType} from '@models/booking.model';
import * as Validator from 'class-validator';

export class ClientDto implements Client {
  @Validator.Length(3, 125)
  city: string;

  @Validator.Length(3, 125)
  contactPerson: string;

  @Validator.IsEmail()
  @Validator.Length(3, 125)
  email: string;

  @Validator.Length(3, 125)
  name: string;

  @Validator.Length(3, 15)
  phone: string;

  @Validator.Length(3, 125)
  street: string;

  @Validator.IsEnum(['INDIVIDUAL', 'COMPANY'])
  type: TClientType;

  @Validator.Length(6, 6)
  zipCode: string;
}
