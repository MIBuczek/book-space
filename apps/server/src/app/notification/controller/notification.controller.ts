import {Body, Controller, HttpCode, HttpStatus, Post, UseGuards} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {NotificationService} from '../service/notification.service';
import {BookingNotificationDto, MessageDto} from '../models/notification.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * Outbound e-mail (FR-032–FR-036, FR-041).
 *
 * The two routes have deliberately different access:
 *
 * - `POST /notifications/message` is public. The contact form (FR-034) is the one notification
 *   a visitor can trigger, and the legacy form was on the public Contact page. It cannot name a
 *   recipient other than a facility employee, and the recipient is validated as an e-mail, so
 *   it is not an open relay.
 * - `POST /notifications/booking` requires a staff role. It is the operator's opt-in to notify
 *   a facility or SISK staff about a booking (FR-032, FR-033); the recipient is resolved from
 *   the booking and configuration, never from the body.
 *
 * Both answer `202 Accepted` on success, matching the contract: the notification is accepted
 * for delivery, and a provider failure is a `502` (FR-036) rather than a retryable `5xx` on the
 * booking write, which has already happened.
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

  @Post('message')
  @HttpCode(HttpStatus.ACCEPTED)
  sendMessage(@Body() body: MessageDto) {
    return this.notificationService.sendMessage(body);
  }
}
