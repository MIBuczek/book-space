import {CanActivate, ExecutionContext, HttpStatus, Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Request} from 'express';
import {RateLimitStore} from './rate-limit.store';
import {StructuredHttpException} from '../../config/structured-http-exception';

/**
 * The rate-limit settings for a public write route, read from configuration (FR-048).
 *
 * The defaults are deliberately generous for a human filling in a form — twelve booking
 * requests or thirty messages in ten minutes from one address — and low enough that a script
 * is stopped quickly. A limit of `0` disables the check, which is what a test or a
 * single-purpose deployment wants; it is read as "unlimited", never as "refuse everything".
 */
export interface IRateLimitConfig {
  /** Requests allowed per window, per key. `0` disables the check. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Refuses a public write once a caller exceeds its allowance, answering `429` (FR-048).
 *
 * Two keys are counted, because they stop different attacks and neither subsumes the other:
 *
 * - the **client IP** stops one machine hammering the route from a single address;
 * - the **submitted e-mail** stops a distributed submitter (or one behind a shared NAT) that
 *   rotates its address but reuses one contact address — which is also the key the outbound
 *   e-mail quota uses, so the two limits reinforce each other.
 *
 * The e-mail is read from the request body *after* the global `ValidationPipe` has run, so it
 * is already trimmed and validated; an absent or malformed address simply skips the second
 * key rather than throwing, because the DTO's own `422` is the right answer for that body.
 *
 * The guard is attached per route, not at the class: the routes it protects are the public
 * writes, and a controller-level guard would run on the authenticated reads too — the same
 * shape `RolesGuard` uses on the booking and notification controllers.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** Sweep expired windows at most once a second, rather than on every request. */
  private lastPrune = 0;

  constructor(
    private readonly store: RateLimitStore,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & {body?: {email?: unknown; personEmail?: unknown}}>();
    const now = Date.now();
    if (now - this.lastPrune > 1000) {
      this.store.prune(now);
      this.lastPrune = now;
    }

    const {limit, windowMs} = this.settings();

    const ip = clientIp(request);
    const ipVerdict = this.store.record(`ip:${ip}`, limit, windowMs, now);
    if (!ipVerdict.allowed) {
      throw this.tooManyRequests(ipVerdict.retryAfterSeconds);
    }

    const email = submittedEmail(request);
    if (email) {
      const emailVerdict = this.store.record(`email:${email}`, limit, windowMs, now);
      if (!emailVerdict.allowed) {
        throw this.tooManyRequests(emailVerdict.retryAfterSeconds);
      }
    }

    return true;
  }

  private settings(): IRateLimitConfig {
    return {
      limit: this.numberFrom('PUBLIC_RATE_LIMIT', 12),
      windowMs: this.numberFrom('PUBLIC_RATE_LIMIT_WINDOW_MS', 600_000)
    };
  }

  /**
   * Reads a numeric setting, falling back to the default.
   *
   * `ConfigService.get` returns a string for an environment variable; `Number('')` is `0`,
   * which would silently disable the limit, so an empty value is treated as absent rather
   * than as zero. A non-numeric value falls back to the default too — a typo must not turn
   * the limit off.
   */
  private numberFrom(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * The `429` body.
   *
   * `StructuredHttpException` carries `retryAfterSeconds` through the global error filter,
   * which otherwise narrows every error to `{statusCode, message, error}` and would drop it —
   * the same reason the conflicted-approval `409` uses this class. It is only honoured below
   * `500`, so it cannot be used to smuggle a driver message out.
   */
  private tooManyRequests(retryAfterSeconds: number): StructuredHttpException {
    return new StructuredHttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
        retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}

/**
 * The client's IP.
 *
 * `request.ip` is Express's own resolution, which honours `trust proxy` when the operator has
 * set it. It is not read from `X-Forwarded-For` here: trusting that header unconditionally
 * lets a caller pick their own key and walk around the limit, so the operator opts in by
 * configuring the proxy (see `spec.md` FR-048).
 */
const clientIp = (request: Request): string => request.ip ?? request.socket?.remoteAddress ?? 'unknown';

/** The submitted sender address, lower-cased, or `null` when the body has none. */
const submittedEmail = (request: {body?: {email?: unknown}}): string | null => {
  const email = request.body?.email;
  if (typeof email !== 'string' || email.trim() === '') {
    return null;
  }
  return email.trim().toLowerCase();
};
