import {HttpException, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking} from '../schemas/booking.schema';
import {Model} from 'mongoose';
import {BookedTime} from '../schemas/booked-time.schemta';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';
import {currentActorId} from '../../logging/request-context';

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
      const result = await this.bookingModel.updateOne({_id}, booking);
      // The changed field names are logged, not their values: they identify an
      // approval or an archive without recording personal data. The names are
      // mapped to a fixed action so a caller cannot inject a new label.
      this.logger.log('booking.updated', {
        bookingId: _id,
        actorId: currentActorId(),
        action: describeBookingChange(booking),
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

  async findAllBooking() {
    try {
      return await this.bookingModel.find({});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
