import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Booking } from '../schemas/booking.schema';
import { Model } from 'mongoose';

@Injectable()
export class BookingService {
    constructor(@InjectModel('Booking') private bookingModel: Model<Booking>) { }

    async createBooking(booking: Booking) {
        try {
            return await this.bookingModel.create(booking)
        } catch (e) {
            return new Error(e.message)
        }
    }

    async updateBooking(_id: string, booking: Partial<Booking>) {
        try {
            return await this.bookingModel.updateOne({ _id }, booking)
        } catch (e) {
            return new Error(e.message)
        }
    }

    async deleteBooking(_id: string) {
        try {
            return await this.bookingModel.deleteOne({ _id })
        } catch (e) {
            return new Error(e.message)
        }
    }

    async findBooking(_id: string) {
        try {
            return await this.bookingModel.findOne({ _id })
        } catch (e) {
            return new Error(e.message)
        }
    }

    async findAllBooking() {
        try {
            return await this.bookingModel.find({})
        } catch (e) {
            return new Error(e.message)
        }
    }
}
