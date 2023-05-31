import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';
import validator from 'validator';
import {TClientType} from '@models/booking.model';

export type TClient = HydratedDocument<Client>;

@Schema()
export class Client {
  @Prop({
    type: String,
    required: [true, 'Please pick client type'],
    uppercase: true
  })
  type: TClientType;

  @Prop({
    type: String,
    required: [true, 'Please add company name']
  })
  name: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person name']
  })
  contactPerson: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact phone number']
  })
  phone: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email: string;

  @Prop({
    type: String,
    required: [true, 'Please add client street']
  })
  street: string;

  @Prop({
    type: String,
    required: [true, 'Please add client name']
  })
  city: string;

  @Prop({
    type: String,
    required: [true, 'Please add client zip code'],
    validate: [(val: string) => validator.matches(val, /^[\d./-]+$/)]
  })
  zipCode: string;

  @Prop({
    type: String
  })
  nip?: string;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
