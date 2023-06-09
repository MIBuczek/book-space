import {Controller, UseGuards} from '@nestjs/common';
import {BookingService} from '../service/booking.service';
import {Get} from '@nestjs/common';
import {Param} from '@nestjs/common';
import {Post} from '@nestjs/common';
import {Body} from '@nestjs/common';
import {ValidationPipe} from '@nestjs/common';
import {Put} from '@nestjs/common';
import {Delete} from '@nestjs/common';
import {BookingDto} from '../models/booking.dto';
import {AuthGuard} from '@nestjs/passport';
import {BookedTimeDto} from '@server/bookings/models/booked-time.dto';

@Controller('bookings')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getAllBookings() {
    return this.bookingService.findAllBooking();
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleBooking(@Param('_id') _id: string) {
    return this.bookingService.findBooking(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createBooking(@Body(new ValidationPipe()) newBooking: BookingDto) {
    return this.bookingService.createBooking(newBooking);
  }

  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  updateBooking(
    @Param('_id') _id: string,
    @Body(new ValidationPipe()) booking: Partial<BookingDto>
  ) {
    return this.bookingService.updateBooking(_id, booking);
  }

  @Put(':_id/booked_times')
  @UseGuards(AuthGuard('jwt'))
  updateBookedTimes(
    @Param('_id') _id: string,
    @Body(new ValidationPipe()) bookedTimes: Partial<BookedTimeDto>
  ) {
    return this.bookingService.updateBookedTimes(_id, bookedTimes);
  }

  @Delete(':_id')
  @UseGuards(AuthGuard('jwt'))
  deleteBooking(@Param('_id') _id: string) {
    return this.bookingService.deleteBooking(_id);
  }
}
