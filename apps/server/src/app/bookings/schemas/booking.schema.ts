import { HydratedDocument } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  IPlace,
  TClient,
  TPayment,
} from '@server/bookings/models/booking.model';
import { TBookedTime } from '@server/bookings/schemas/single-booking-time.schemta';
import validator from 'validator';

export type TBooking = HydratedDocument<Booking>;

@Schema()
export class Booking {
  @Prop({
    type: String,
    required: [true, 'Please pick client type'],
    uppercase: true,
  })
  type: TClient;

  @Prop({
    type: Object,
    required: [true, 'Please add booked place'],
  })
  place: IPlace;

  @Prop({
    type: String,
    required: [true, 'Please pick booked size'],
    uppercase: true,
  })
  size: string;

  @Prop({
    type: String,
  })
  clientId: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person name'],
  })
  personName: string;

  @Prop({
    type: String,
  })
  personCompany: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email'],
  })
  personEmail: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person phone number'],
  })
  personPhone: string;

  @Prop({
    type: Number,
    required: [true, 'Please select month'],
  })
  month: number;

  @Prop({
    type: Array,
    required: [true, 'Please add at least one booked time'],
  })
  bookedTimes: TBookedTime;

  @Prop({
    type: Boolean,
    required: [true],
  })
  accepted: boolean;

  @Prop({
    type: String,
  })
  comments: string;

  @Prop({
    type: String,
    required: [true, 'Please select payment method'],
  })
  paymentMethod: TPayment;

  @Prop({
    type: Boolean,
    required: [true],
    default: () => false,
  })
  archive: boolean;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
