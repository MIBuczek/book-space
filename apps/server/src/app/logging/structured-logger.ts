import {Injectable, Logger} from '@nestjs/common';
import {currentCorrelationId} from './request-context';
import {redact} from './redact';

type TLogFields = Record<string, unknown>;

/**
 * Emits one JSON object per record on stdout, which is what a log collector
 * expects. Nest's default logger prints a colourised line intended for a
 * terminal, which cannot be queried by field.
 *
 * Context is attached in one place — the correlation id from the ambient
 * request, and the redaction of any sensitive field — so a call site only
 * names what happened.
 */
@Injectable()
export class StructuredLogger {
  private readonly logger = new Logger('app');

  private write(level: 'log' | 'warn' | 'error', message: string, fields: TLogFields = {}): void {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: currentCorrelationId(),
      ...(redact(fields) as TLogFields),
    };

    // Nest's Logger is used as the sink so the record still reaches whatever
    // transport the application configures, rather than writing to stdout
    // directly and bypassing it.
    this.logger[level](JSON.stringify(record));
  }

  log(message: string, fields?: TLogFields): void {
    this.write('log', message, fields);
  }

  warn(message: string, fields?: TLogFields): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields?: TLogFields): void {
    this.write('error', message, fields);
  }

  /**
   * A notification that could not be delivered. The provider response and the
   * booking it belonged to are both recorded, because a failure is only
   * actionable if the record says which send failed and what the provider
   * replied. The recipient address is deliberately left to `redact`.
   */
  notificationFailure(fields: {bookingId?: string; provider?: string; response?: string}): void {
    this.write('error', 'notification.failed', fields);
  }
}
