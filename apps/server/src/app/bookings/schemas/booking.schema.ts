import {HydratedDocument} from 'mongoose';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {TBookedTime} from '../schemas/booked-time.schemta';
import {TClientType, TPayment, IPlace} from '@models/booking.model';
import validator from 'validator';

export type TBooking = HydratedDocument<Booking>;

@Schema()
export class Booking {
  @Prop({
    type: String,
    required: [true, 'Please pick client type'],
    uppercase: true
  })
  type!: TClientType;

  @Prop({
    type: Object,
    required: [true, 'Please add booked place']
  })
  place!: IPlace;

  @Prop({
    type: String,
    required: [true, 'Please pick booked size'],
    uppercase: true
  })
  size!: string;

  @Prop({
    type: String
  })
  clientId!: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person name']
  })
  personName!: string;

  @Prop({
    type: String
  })
  personCompany!: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  personEmail!: string;

  @Prop({
    type: String,
    required: [true, 'Please add booked person phone number']
  })
  personPhone!: string;

  @Prop({
    type: Number,
    required: [true, 'Please select month']
  })
  month!: number;

  @Prop({
    type: Array,
    required: [true, 'Please add at least one booked time']
  })
  bookedTimes!: Array<TBookedTime>;

  @Prop({
    type: Boolean,
    required: [true]
  })
  accepted!: boolean;

  @Prop({
    type: String
  })
  comments!: string;

  @Prop({
    type: String,
    required: [true, 'Please select payment method']
  })
  paymentMethod!: TPayment;

  @Prop({
    type: Boolean,
    required: [true],
    default: () => false
  })
  archive!: boolean;

  /**
   * The user reference of the booking's creator, used for the ownership decision
   * (authorization matrix note 4). Optional because records migrated from the legacy
   * collection may carry an e-mail here, or nothing at all, and the owner check
   * treats both as "no ownership" rather than failing to load the record.
   */
  @Prop({
    type: String
  })
  createdBy?: string;

  /**
   * When the booking was created (FR-016, FR-020). Immutable and defaulted, matching
   * the `users` schema's `createdAt`.
   *
   * The booking-list period filter (`from`/`to`) ranges over this field, following the
   * legacy `getBookingsDataByDate`, which ordered and bounded the query on `createdAt`.
   * It is a real field rather than a projection of `_id`, because the migration supplies
   * it for legacy records (research.md R10) and a migrated booking's creation time is not
   * its ObjectId timestamp.
   */
  @Prop({
    type: Date,
    immutable: true,
    default: () => new Date()
  })
  createdAt?: Date;

  /**
   * Who last modified the booking, and when (FR-016).
   *
   * Written by the decision routes (approve/archive) and by any future write path,
   * not by a schema hook: the legacy app stamped these from the component, and
   * moving the write here is what makes the record survive an update that does not
   * go through the form.
   */
  @Prop({
    type: String
  })
  modifiedBy?: string;

  @Prop({
    type: Date
  })
  modifiedAt?: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

/**
 * The booking-list read shape (FR-020, FR-022, FR-043, data-model.md indexes).
 *
 * The list filters on the period, then the facility and archive, and sorts by recency.
 * The compound key leads with `createdAt` because the period is the bound every list
 * request carries, and `_id` trails it so the sort is total: two bookings created in the
 * same millisecond would otherwise order arbitrarily between pages and a record could be
 * skipped or repeated. `data-model.md` names `{createdAt: -1}`; the extra key is what
 * makes it a stable cursor rather than a partial order.
 */
BookingSchema.index({createdAt: -1, _id: -1});
