import {Injectable} from '@nestjs/common';

/**
 * A fixed-window counter, in memory (T057, FR-048).
 *
 * The public write endpoints (`POST /bookings`, `POST /notifications/message`) are the only
 * routes an unauthenticated caller can drive, so they are the only ones a script can use
 * without first obtaining a credential. This store answers one question — "has this key
 * exceeded its limit in the current window?" — and the guard turns a refusal into a `429`.
 *
 * **In-memory, per instance.** A single municipal API process is the deployment this project
 * targets, so a process-local window is sufficient and needs no dependency, no Redis and no
 * schema. It is a deliberate limitation, not an oversight: behind more than one replica the
 * effective limit is multiplied by the number of replicas, and a restart clears the counters.
 * The store is a class with a `record(key, limit, windowMs)` seam so a shared backend can
 * replace it without touching the guard, and the choice is recorded in `spec.md` and
 * `AGENTS.md`.
 *
 * A fixed window rather than a sliding one: the window opens on the first request and resets
 * when it elapses. A sliding window smooths the boundary burst at the cost of tracking every
 * timestamp; for abuse protection on a municipal form the fixed window is the right trade, and
 * the burst it permits (up to `limit` at the end of one window and `limit` at the start of the
 * next) is far below what an unthrottled route allows.
 */
export interface IRateLimitVerdict {
  /** Whether the key is still within its allowance. */
  allowed: boolean;
  /** The number of requests remaining in the window. */
  remaining: number;
  /** Seconds until the window resets, so a client knows when to retry. */
  retryAfterSeconds: number;
}

interface IWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitStore {
  private readonly windows = new Map<string, IWindow>();

  /**
   * Records one hit for `key` and reports whether it is allowed.
   *
   * The window opens on the first hit and lasts `windowMs`. Once it elapses the counter is
   * replaced rather than decremented, so a key that was quiet for a window starts clean. A
   * `limit` of `0` or less disables the check (the operator's off switch), and is treated as
   * unlimited rather than "allow nothing" — a limit of zero that refused every request would
   * make a misconfigured environment look like a broken endpoint.
   */
  record(key: string, limit: number, windowMs: number, now = Date.now()): IRateLimitVerdict {
    if (limit <= 0) {
      return {allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0};
    }

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, {count: 1, resetAt: now + windowMs});
      return {allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000)};
    }

    existing.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    if (existing.count > limit) {
      return {allowed: false, remaining: 0, retryAfterSeconds};
    }
    return {allowed: true, remaining: limit - existing.count, retryAfterSeconds};
  }

  /** Drops every window. Called between tests so one case cannot consume another's allowance. */
  clear(): void {
    this.windows.clear();
  }

  /**
   * Evicts windows whose reset time has passed.
   *
   * Without this the map grows by one entry per distinct IP or address seen and never shrinks,
   * which is a slow memory leak on a long-lived process — and an attacker could grow it at will
   * by varying the key. The guard calls this on a cadence rather than on every request, so the
   * sweep cost is amortised.
   */
  prune(now = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }

  /** The number of live windows, for tests and diagnostics. */
  size(): number {
    return this.windows.size;
  }
}
