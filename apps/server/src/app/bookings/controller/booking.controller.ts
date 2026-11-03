import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {Request} from 'express';
import {BookingService} from '../service/booking.service';
import {BookingDto} from '../models/booking.dto';
import {ConflictsQueryDto} from '../models/conflicts-query.dto';
import {AuthGuard} from '@nestjs/passport';
import {BookedTimeDto} from '../models/booked-time.dto';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';
import {CurrentUser} from '../../authorization/decorators/current-user.decorator';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';
import {actingUserId, canModifyBooking, IActingUser, isStaff} from '../../authorization/ownership';
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

  /**
   * The conflicting unaccepted bookings for one facility-month (FR-015).
   *
   * Administrator-only: the matrix gives the conflict counter to administrators, and
   * the answer names bookings a non-administrator is not entitled to see. `@Roles`
   * and `RolesGuard` are applied per route rather than at the class, because the rest
   * of this controller is public or any-authenticated.
   *
   * Declared before `@Get(':_id')`. Express matches routes in declaration order, so
   * the reverse order would make `conflicts` a booking id and answer `404`/`500`
   * instead of the conflicts. `delete-routes.spec.ts` guards the same class of
   * mistake for the delete routes.
   */
  @Get('conflicts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  getConflicts(@Query() query: ConflictsQueryDto) {
    return this.bookingService.findConflictingBookingIds(query.city, query.building, query.month);
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleBooking(@Param('_id') _id: string) {
    return this.bookingService.findBooking(_id);
  }

  /**
   * Creates a booking and stamps its creator.
   *
   * The ownership reference is taken from the authenticated user, never from the
   * body: a caller-supplied `createdBy` would let a staff member attribute a booking
   * to someone else and then be unable to edit it, or — worse — attribute it to a
   * person whose identity they are about to impersonate. The DTO does not declare
   * the field, so `whitelist`/`forbidNonWhitelisted` already rejects a body that
   * tries to set it; stamping here is the positive half of that.
   */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  createBooking(@Body() newBooking: BookingDto, @CurrentUser() user: IActingUser) {
    return this.bookingService.createBooking({...newBooking, createdBy: actingUserId(user)});
  }

  /**
   * Updates a booking, after checking the caller owns it (FR-023, matrix note 4).
   *
   * The record is loaded first so the decision is made against the stored owner
   * rather than anything the caller sent. A missing booking is `404`; a booking the
   * caller may not modify is `403`. An administrator bypasses the owner check inside
   * `canModifyBooking`, which is where the "any booking" row of the matrix lives.
   */
  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  async updateBooking(@Param('_id') _id: string, @Body() booking: Partial<BookingDto>, @CurrentUser() user: IActingUser) {
    await this.assertCanModify(_id, user);
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
  async deleteBooking(@Param('_id') _id: string, @CurrentUser() user: IActingUser) {
    await this.assertCanModify(_id, user);
    return this.bookingService.deleteBooking(_id);
  }

  /**
   * Loads the booking and refuses the request unless the caller may modify it.
   *
   * `404` and `403` are kept distinct on purpose. Collapsing them would hide whether
   * a booking exists, but the caller is already authenticated and the `GET` route
   * already reveals that, so the distinction costs nothing and a `403` tells a
   * legitimate staff member they reached the wrong record rather than that it is
   * missing.
   */
  private async assertCanModify(_id: string, user: IActingUser): Promise<void> {
    const booking = await this.bookingService.findBooking(_id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (!canModifyBooking(user, booking)) {
      throw new ForbiddenException('You may only modify a booking you created');
    }
  }
}
