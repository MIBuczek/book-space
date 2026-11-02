import {Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {BookingService} from '../service/booking.service';
import {BookingDto} from '../models/booking.dto';
import {AuthGuard} from '@nestjs/passport';
import {BookedTimeDto} from '../models/booked-time.dto';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';
import {CurrentUser} from '../../authorization/decorators/current-user.decorator';
import {IActingUser, isStaff} from '../../authorization/ownership';
import {serializePublicBookings} from '../models/booking.serializer';

@Controller('bookings')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  /**
   * The calendar. Public, and the same route for staff.
   *
   * A public caller gets only accepted, non-archived bookings, with the tenant's
   * personal fields removed. Staff get the full record — including the unaccepted
   * and archived ones they are entitled to see.
   *
   * One `staff` boolean drives both the query and the response shape, because two
   * decisions that can disagree are two chances to serve personal data: computing the
   * scope from the user and the shape from the request served a restricted query's
   * results *unredacted* whenever the two inputs differed.
   *
   * It is fail-closed on both inputs. `request.isPublic` must be exactly `false`,
   * so a request that never reached the guard is public rather than staff; and the
   * user must carry a recognised role, so an authenticated request that lost its user
   * is public too. Widening the scope takes a positive signal on each, and the
   * narrowest reading is the default.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAllBookings(@Req() request: Request, @CurrentUser() user: IActingUser | undefined) {
    const staff = request.isPublic === false && isStaff(user);
    const bookings = await this.bookingService.findAllBooking(staff);

    return staff ? bookings : serializePublicBookings(bookings);
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleBooking(@Param('_id') _id: string) {
    return this.bookingService.findBooking(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createBooking(@Body() newBooking: BookingDto) {
    return this.bookingService.createBooking(newBooking);
  }

  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  updateBooking(
    @Param('_id') _id: string,
    @Body() booking: Partial<BookingDto>
  ) {
    return this.bookingService.updateBooking(_id, booking);
  }

  @Put(':_id/booked_times')
  @UseGuards(AuthGuard('jwt'))
  updateBookedTimes(
    @Param('_id') _id: string,
    @Body() bookedTimes: Partial<BookedTimeDto>
  ) {
    return this.bookingService.updateBookedTimes(_id, bookedTimes);
  }

  @Delete(':_id')
  @UseGuards(AuthGuard('jwt'))
  deleteBooking(@Param('_id') _id: string) {
    return this.bookingService.deleteBooking(_id);
  }
}
