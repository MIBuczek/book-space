import {Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '@nestjs/passport';
import {NotificationService} from '../service/notification.service';
import {BookingNotificationDto, MessageDto} from '../models/notification.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';
import {RateLimitGuard} from '../../security/rate-limit/rate-limit.guard';
import {HoneypotGuard} from '../../security/honeypot/honeypot.guard';

/**
 * Outbound e-mail (FR-032–FR-036, FR-041).
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
 *   the booking and configuration, never from the body.
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

  @Post('booking')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OFFICE', 'ADMIN')
  @HttpCode(HttpStatus.ACCEPTED)
  notifyBooking(@Body() body: BookingNotificationDto) {
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
