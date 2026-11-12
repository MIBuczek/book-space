import {HttpStatus, Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {RateLimitStore} from '../rate-limit/rate-limit.store';
import {StructuredHttpException} from '../../config/structured-http-exception';

/**
 * Caps how often the notification module may send to one recipient (FR-050).
 *
 * The rate-limit guard (FR-048) caps how fast one caller may *submit*; this caps how many
 * messages one *address* may receive. They are different controls: a script behind rotating
 * IPs, or simply one that stays just under the request limit, can still drive the module as a
 * relay, and the recipient is the resource being abused. Counting per recipient means the
 * tenant inbox and every facility employee address has its own ceiling, so a flood aimed at one
 * address cannot be spread across callers.
 *
 * The check runs inside `NotificationService` *before* the transport is called, so a message
 * that would exceed the quota is refused with `429` and never handed to the provider — the
 * send that would have cost the operator money is the one that does not happen. A refusal is
 * a `429`, the same status the request-rate guard answers, because from the caller's point of
 * view both mean "slow down".
 *
 * In-memory for the same reason as the request limiter: a single-process municipal API. The
 * window opens on the first send and resets when it elapses; a `quota` of `0` disables the
 * check.
 */
@Injectable()
export class OutboundQuotaService {
  constructor(
    private readonly store: RateLimitStore,
    private readonly configService: ConfigService
  ) {}

  /**
   * Records a send to `recipient`, throwing `429` when it would exceed the quota.
   *
   * The recipient is lower-cased so the same mailbox is one key regardless of how the caller
   * or a facility record cased it — otherwise `Biuro@example.com` and `biuro@example.com`
   * would each get a full quota.
   */
  assertAllowed(recipient: string): void {
    const quota = this.numberFrom('NOTIFICATION_QUOTA', 20);
    const windowMs = this.numberFrom('NOTIFICATION_QUOTA_WINDOW_MS', 3_600_000);

    const verdict = this.store.record(`outbound:${recipient.trim().toLowerCase()}`, quota, windowMs);
    if (!verdict.allowed) {
      throw new StructuredHttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many messages have been sent to this address. Please try again later.',
          error: 'Too Many Requests',
          retryAfterSeconds: verdict.retryAfterSeconds
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private numberFrom(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
