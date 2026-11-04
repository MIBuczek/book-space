import {HydratedDocument} from 'mongoose';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {BOOKING_STATUSES, TSingleBookingStatus} from '@models/booked-time.model';

export type TBookedTime = HydratedDocument<BookedTime>;

@Schema()
export class BookedTime {
  @Prop({
    type: Date,
    required: [true, 'Please pick booked time day']
  })
  day!: Date;

  @Prop({
    type: Date,
    required: [true, 'Please pick booked time start hours']
  })
  startHours!: Date;

  /**
   * The slot's end, which must be strictly after `startHours` (FR-012).
   *
   * The legacy application checked this in the browser only, so a crafted request could
   * store an inverted interval — which then breaks conflict detection and calendar
   * rendering. This is the defensive half of the rule; the DTO enforces it at the
   * boundary with a `422` and a field-level message. `this` is the subdocument under
   * document validation, so the comparison reads the sibling field.
   */
  @Prop({
    type: Date,
    required: [true, 'Please pick booked time end hours'],
    validate: {
      validator: function (this: BookedTime, value: Date) {
        if (!(value instanceof Date) || !(this.startHours instanceof Date)) {
          return true;
        }
        return value.getTime() > this.startHours.getTime();
      },
      message: 'End hours need to be after start hours'
    }
  })
  endHours!: Date;

  @Prop({
    type: String
  })
  comments!: string;

  /**
   * The participant count, 0–50 (data-model.md). The legacy UI collected it as a string,
   * so the migration coerces it; this validates the stored value defensively, and the DTO
   * rejects a non-numeric value at the boundary.
   */
  @Prop({
    type: Number,
    min: [0, 'Participants can not be lower than 0'],
    max: [50, 'Participants can not be higher than 50'],
    validate: {
      validator: (value: number) => value === undefined || Number.isInteger(value),
      message: 'Participants need to be an integer'
    }
  })
  participants!: number;

  /**
   * The slot status. The enum is `INITIAL | DONE | CANCELED`; the legacy value `QUIT`
   * maps to `CANCELED` during migration (data-model.md bookedTimes, CHK014).
   */
  @Prop({
    type: String,
    enum: BOOKING_STATUSES,
    required: [true, 'Please add booked time status']
  })
  status!: TSingleBookingStatus;
}

export const BookedTimeSchema = SchemaFactory.createForClass(BookedTime);
