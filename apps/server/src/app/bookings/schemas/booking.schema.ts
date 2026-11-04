import {HydratedDocument} from 'mongoose';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {TBookedTime, BookedTimeSchema} from '../schemas/booked-time.schema';
import {SelectedExtraOptionSchema} from '../schemas/selected-extra-option.schema';
import {TClientType, TPayment, IPlace} from '@models/booking.model';
import {ISelectedExtraOption} from '@models/selected-extra-option.model';
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

  /**
   * The calendar label shown instead of the tenant's name (FR-011, data-model.md `nick`).
   *
   * Required: the legacy booking always carried one, and the public calendar shows this
   * field in place of the personal details the serialiser removes. A booking without it
   * would be unlabelled to an anonymous caller.
   */
  @Prop({
    type: String,
    required: [true, 'Please add the booking nick'],
    minlength: [3, 'Booking nick need to be at least 3 characters'],
    maxlength: [100, 'Booking nick can have maximal 100 characters']
  })
  nick!: string;

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
    type: [BookedTimeSchema],
    required: [true, 'Please add at least one booked time']
  })
  bookedTimes!: Array<TBookedTime>;

  @Prop({
    type: Boolean,
    required: [true],
    default: () => false
  })
  accepted!: boolean;

  /**
   * Whether the submitter acknowledged the RODO clause (FR-011). Recorded on the booking so
   * the acknowledgement is provable after the fact, not merely required at the boundary: a
   * consent the system did not keep is a consent it cannot show.
   *
   * Optional because staff may enter a booking on a tenant's behalf and the legacy staff path
   * did not collect it; the service requires it for a public submission.
   */
  @Prop({
    type: Boolean,
    default: () => false
  })
  rodoAcknowledgement?: boolean;

  @Prop({
    type: String
  })
  comments!: string;

  @Prop({
    type: String,
    required: [true, 'Please select payment method']
  })
  paymentMethod!: TPayment;

  /**
   * A percentage discount such as `10%` (data-model.md `discount`). Optional, and validated
   * against `^[0-9]{1,3}%$`; the range 0–100 is enforced by the DTO so the stored value and
   * the contract agree.
   */
  @Prop({
    type: String,
    validate: {
      validator: (value: string) => /^[0-9]{1,3}%$/.test(value),
      message: 'Discount must be a percentage such as 10%'
    }
  })
  discount?: string;

  /**
   * Derived: true when `selectedOptions` is non-empty (data-model.md). Kept as a stored
   * boolean rather than a virtual because the legacy reporting reads it directly, and a
   * virtual would be absent from an aggregation or a projection.
   */
  @Prop({
    type: Boolean,
    default: () => false
  })
  extraOptions!: boolean;

  @Prop({
    type: [SelectedExtraOptionSchema],
    default: () => []
  })
  selectedOptions!: ISelectedExtraOption[];

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

/**
 * The facility-month filter the conflict rules run (FR-015, FR-043, data-model.md).
 *
 * The key order matches the query the conflict service and the list build — city, then
 * facility, then month — and `accepted`/`archive` trail it because the list filters on them
 * after the scope is fixed. A query that leads with the scope is what lets the index be
 * used as a prefix rather than scanned.
 */
BookingSchema.index({'place.city': 1, 'place.place': 1, month: 1, accepted: 1, archive: 1});

/**
 * The per-client reporting read (FR-043, data-model.md): every booking for one client,
 * narrowed by whether it was accepted. `clientId` leads because it is the most selective
 * field the report has.
 */
BookingSchema.index({clientId: 1, accepted: 1});
