import {HydratedDocument} from 'mongoose';
import {Prop, SchemaFactory} from '@nestjs/mongoose';
import validator from 'validator';
import {TUser} from '@server/users/schemas/user.schema';

export type TBuilding = HydratedDocument<Building>;
export class Building {
  @Prop({
    type: String,
    required: [true, 'Please add company name']
  })
  name: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact phone number']
  })
  phone: string;

  @Prop({
    type: String,
    required: [true, 'Please add client name']
  })
  city: string;

  @Prop({
    type: String,
    required: [true, 'Please add client street']
  })
  street: string;

  @Prop({
    type: String,
    required: [true, 'Please add client zip code'],
    validate: [(val: string) => validator.matches(val, /^[\d./-]+$/)]
  })
  zipCode: string;

  @Prop({
    type: Array,
    required: [true, 'Please add at least one employee']
  })
  employees: Array<TUser>;
}

export const BuildingSchema = SchemaFactory.createForClass(Building);
