import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking} from '../schemas/booking.schema';
import {Model} from 'mongoose';
import {BookedTime} from '@server/bookings/schemas/booked-time.schemta';

@Injectable()
export class BookingService {
  constructor(@InjectModel('Booking') private bookingModel: Model<Booking>) {}

  async createBooking(booking: Booking) {
    try {
      const resp = await this.bookingModel.create(booking);
      if(!resp){
        throw new HttpException('Could not create data', HttpStatus.BAD_REQUEST);
      }
      return resp
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async updateBooking(_id: string, booking: Partial<Booking>) {
    try {
      const resp = await this.bookingModel.updateOne({_id}, booking);
      if(!resp){
        throw new HttpException('Could not update data', HttpStatus.BAD_REQUEST);
      }
      return resp
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async updateBookedTimes (_id: string, bookedTimes: Partial<BookedTime>){
    try {
      const resp = await this.bookingModel.updateOne({_id}, {bookedTimes});
      if(!resp){
        throw new HttpException('Could not update data', HttpStatus.BAD_REQUEST);
      }
      return resp
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async deleteBooking(_id: string) {
    try {
      const resp = await this.bookingModel.deleteOne({_id});
      if(!resp){
        throw new HttpException('Could not delete data', HttpStatus.BAD_REQUEST);
      }
      return resp
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findBooking(_id: string) {
    try {
      const resp = await this.bookingModel.findOne({_id});
      if (!resp) {
        throw new HttpException('Not found', HttpStatus.NOT_FOUND);
      }
      return resp;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findAllBooking() {
    try {
      const resp = await this.bookingModel.find({});
      if(!resp){
        throw new HttpException('Problem with servers', HttpStatus.BAD_GATEWAY);
      }
      return resp
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
