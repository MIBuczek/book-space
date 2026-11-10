import {Global, Module} from '@nestjs/common';
import {RateLimitStore} from './rate-limit/rate-limit.store';
import {RateLimitGuard} from './rate-limit/rate-limit.guard';
import {HoneypotGuard} from './honeypot/honeypot.guard';
import {OutboundQuotaService} from './quota/outbound-quota.service';

/**
 * The abuse-protection primitives for the public endpoints (T057, FR-048–FR-050).
 *
 * `@Global` so the two guards can be attached to a route in any module — a guard listed in
 * `@UseGuards` is resolved from the *controller's* module context, so a bookings route needs
 * `RateLimitGuard` to be reachable from `BookingsModule` without every module re-importing
 * this one. The store is a single instance for the process (the counters only mean something
 * if every route shares them), which `@Global` plus a single provider gives for free.
 *
 * `ConfigService` is used by the guard and the quota service and is already global (registered
 * by `ConfigModule.forRoot({isGlobal: true})`), so it needs no import here.
 */
@Global()
@Module({
  providers: [RateLimitStore, RateLimitGuard, HoneypotGuard, OutboundQuotaService],
  exports: [RateLimitStore, RateLimitGuard, HoneypotGuard, OutboundQuotaService]
})
export class SecurityModule {}
