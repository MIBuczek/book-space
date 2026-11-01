import {HttpException, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking} from '../schemas/booking.schema';
import {Model} from 'mongoose';
import {BookedTime} from '../schemas/booked-time.schemta';
import {errorMessage, errorStatus} from '../../utility/http-error';

@Injectable()
export class BookingService {
  constructor(@InjectModel('Booking') private bookingModel: Model<Booking>) {}

  async createBooking(booking: Booking) {
    try {
      return await this.bookingModel.create(booking);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBooking(_id: string, booking: Partial<Booking>) {
    try {
      return await this.bookingModel.updateOne({_id}, booking);
    } catch (e) {
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
      return await this.bookingModel.deleteOne({_id});
    } catch (e) {
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
