import { HydratedDocument } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TSingleBookingStatus } from '@models/booked-time.model';

export type TBookedTime = HydratedDocument<BookedTime>;

@Schema()
export class BookedTime {
  @Prop({
    type: Date,
    required: [true, 'Please pick booked time day'],
  })
  day: Date;

  @Prop({
    type: Date,
    required: [true, 'Please pick booked time start hours'],
  })
  startHours: Date;

  @Prop({
    type: Date,
    required: [true, 'Please pick booked time end hours'],
  })
  endHours: Date;

  @Prop({
    type: String,
  })
  comments: string;

  @Prop({
    type: String,
  })
  participants: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked time status'],
  })
  status: TSingleBookingStatus;
}

export const BookedTimeSchema = SchemaFactory.createForClass(BookedTime);
