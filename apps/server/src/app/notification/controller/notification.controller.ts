import {Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, Req, UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '@nestjs/passport';
import {NotificationService} from '../service/notification.service';
import {BookingNotificationDto, MessageDto} from '../models/notification.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';
import {CurrentUser} from '../../authorization/decorators/current-user.decorator';
import {IActingUser} from '../../authorization/ownership';
import {RateLimitGuard} from '../../security/rate-limit/rate-limit.guard';
import {HoneypotGuard} from '../../security/honeypot/honeypot.guard';

/**
 * Outbound e-mail (FR-032–FR-036, FR-041, FR-052).
 *
 * The two routes have deliberately different access:
 *
 * - `POST /notifications/message` is public. The contact form (FR-034) is the one notification
 *   a visitor can trigger, and the legacy form was on the public Contact page. A `recipient`
 *   names a facility employee (FR-041), which is a *staff* action — the public form never sets
 *   one — so the route runs `OptionalJwtAuthGuard` and `NotificationService` allows the
 *   recipient only when the caller is staff *and* the address is a facility's contact address.
 *   That is what stops the route being an open relay (issue #124).
 * - `POST /notifications/booking` requires a staff role. It is the operator's opt-in to notify
 *   a facility or SISK staff about a booking (FR-032, FR-033); the recipient is resolved from
 *   the booking and configuration, never from the body. Its `APPLICANT` audience (FR-052,
 *   T062) is the decision notification, so it is narrowed to an administrator below — the same
 *   role the approve/reject routes carry — rather than left to any staff member.
 *
 * Both answer `202 Accepted` on success, matching the contract: the notification is accepted
 * for delivery, and a provider failure is a `502` (FR-036) rather than a retryable `5xx` on the
 * booking write, which has already happened. The message route also runs `RateLimitGuard`
 * (FR-048), `HoneypotGuard` (FR-049) and, inside the service, the per-recipient outbound
 * quota (FR-050).
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * `APPLICANT` is administrator-only, the rest of the route is staff (FR-052).
   *
   * The audience is read from the body, so the role check has to read the *authenticated* role,
   * not the request: a caller cannot grant themselves the audience. It mirrors
   * `BookingController.getAllBookings`'s `all` check, which narrows one field of an otherwise
   * staff route the same way. The rule is enforced here rather than in the service because the
   * service has no view of the caller, and a rule enforced nowhere is a rule that does not
   * exist.
   */
  @Post('booking')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OFFICE', 'ADMIN')
  @HttpCode(HttpStatus.ACCEPTED)
  notifyBooking(@Body() body: BookingNotificationDto, @CurrentUser() user: IActingUser | undefined) {
    if (body.audience === 'APPLICANT' && user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only an administrator may notify the applicant');
    }
    return this.notificationService.notifyBooking(body);
  }

  /**
   * The caller kind is passed as `request.isPublic !== false`, the same fail-closed flag the
   * calendar and the booking write read. An unmarked request (one that never reached the
   * guard) reads as public, so it cannot claim the staff-only recipient path.
   */
  @Post('message')
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard, HoneypotGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  sendMessage(@Req() request: Request, @Body() body: MessageDto) {
    return this.notificationService.sendMessage(body, request.isPublic !== false);
  }
}
