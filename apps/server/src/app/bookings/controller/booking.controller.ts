import { Controller } from '@nestjs/common';
import { BookingService } from '../service/booking.service';
import { Get } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Booking } from '../schemas/booking.schema';
import { Put } from '@nestjs/common';
import { Delete } from '@nestjs/common';
import { BookingDto } from '../models/booking.dto';

@Controller('booking')
export class BookingController {

    constructor(private bookingService: BookingService) { }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    getAllBookings() {
        return this.bookingService.findAllBooking()
    }

    @Get(':_id')
    @UseGuards(AuthGuard('jwt'))
    getSingleBooking(@Param('_id') _id: string) {
        return this.bookingService.findBooking(_id)
    }

    @Post()
    @UseGuards(AuthGuard('jwt'))
    createBooking(@Body(new ValidationPipe()) newBooking: BookingDto) {
        return this.bookingService.createBooking(newBooking)
    }

    @Put(':_id')
    @UseGuards(AuthGuard('jwt'))
    updateBooking(
        @Param('_id') _id: string,
        @Body(new ValidationPipe()) booking: Partial<BookingDto>) {
        return this.bookingService.updateBooking(_id, booking)
    }

    @Delete('_id')
    @UseGuards(AuthGuard('jwt'))
    deleteBooking(@Param('_id') _id: string) {
        return this.bookingService.deleteBooking(_id)
    }
}
