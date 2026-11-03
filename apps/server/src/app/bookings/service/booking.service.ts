import {HttpException, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking} from '../schemas/booking.schema';
import {Model} from 'mongoose';
import {BookedTime} from '../schemas/booked-time.schemta';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';
import {currentActorId} from '../../logging/request-context';
import {findConflictingBookingIds} from '../conflicts/conflicts';

const CHANGE_LABELS: Array<[keyof Booking, string]> = [
  ['accepted', 'approval'],
  ['archive', 'archive'],
];

const describeBookingChange = (booking: Partial<Booking>): string => {
  const labels = CHANGE_LABELS.filter(([field]) => field in booking).map(([, label]) => label);
  return labels.length > 0 ? labels.join('+') : 'fields';
};

@Injectable()
export class BookingService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    private readonly logger: StructuredLogger
  ) {}

  async createBooking(booking: Booking) {
    try {
      const created = await this.bookingModel.create(booking);
      this.logger.log('booking.created', {bookingId: created._id, actorId: currentActorId()});
      return created;
    } catch (e) {
      this.logger.error('booking.create.failed', {actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBooking(_id: string, booking: Partial<Booking>) {
    try {
      // The owner reference is never updatable. The update body is typed
      // `Partial<BookingDto>`, and a mapped type is erased at runtime, so the global
      // pipe sees `Object` and whitelists nothing on this route — a caller could
      // otherwise send `createdBy` and hand the booking to themselves. Stripping it
      // here is the enforcement that does not depend on the DTO being a class.
      const updates = {...booking};
      delete updates.createdBy;

      const result = await this.bookingModel.updateOne({_id}, updates);
      // The changed field names are logged, not their values: they identify an
      // approval or an archive without recording personal data. The names are
      // mapped to a fixed action so a caller cannot inject a new label.
      this.logger.log('booking.updated', {
        bookingId: _id,
        actorId: currentActorId(),
        action: describeBookingChange(updates),
      });
      return result;
    } catch (e) {
      this.logger.error('booking.update.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBookedTimes(_id: string, bookedTimes: Partial<BookedTime>) {
    try {
      return await this.bookingModel.updateOne({_id}, {bookedTimes});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async deleteBooking(_id: string) {
    try {
      const result = await this.bookingModel.deleteOne({_id});
      this.logger.log('booking.deleted', {bookingId: _id, actorId: currentActorId()});
      return result;
    } catch (e) {
      this.logger.error('booking.delete.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findBooking(_id: string) {
    try {
      return await this.bookingModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * The ids of the unaccepted bookings that conflict within one facility-month
   * (FR-015, contracts/openapi.yaml `/bookings/conflicts`).
   *
   * The facility and month are pushed into the query rather than filtered after the
   * read, for the same reason the public calendar filter is: an unrelated booking is
   * never loaded. Only `accepted: false` is required by the rules, but the query is
   * scoped to the facility-month regardless, because that is the unit the legacy
   * screen computed over and the only scope in which the answer is meaningful.
   *
   * The comparison itself lives in the pure `findConflictingBookingIds`, which is
   * where the rules and their SC-002 oracle are. This method only shapes the query
   * and adapts the documents to what that function reads.
   */
  async findConflictingBookingIds(city: string, building: string, month: number): Promise<string[]> {
    try {
      const bookings = await this.bookingModel.find({
        'place.city': city,
        'place.place': building,
        month,
      });

      // `_id` on a hydrated document is an `ObjectId`, not the `string` the pure
      // function declares, so it is converted here rather than hidden behind a cast.
      // The module compares ids for identity and returns them; handing it an
      // `ObjectId` would make the returned "ids" serialize as hex strings by accident
      // and the identity test depend on reference equality (T017's trap).
      return findConflictingBookingIds(
        bookings.map((booking) => ({
          _id: String(booking._id),
          month: booking.month,
          accepted: booking.accepted,
          bookedTimes: booking.bookedTimes,
        }))
      );
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Lists bookings at the level of detail the caller is entitled to.
   *
   * `includeAll` is a parameter rather than something the service infers from the
   * caller, so the scope decision is made once, in the controller, where the
   * authenticated user is available. The public scope is the *filtered* query, not a
   * post-filter of the full result: the query is what enforces FR-005 at the
   * database, so an unaccepted booking is never read in the first place rather than
   * read and discarded.
   */
  async findAllBooking(includeAll: boolean) {
    try {
      return await this.bookingModel.find(includeAll ? {} : {accepted: true, archive: false});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
