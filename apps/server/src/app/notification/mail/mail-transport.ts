import {StructuredLogger} from '../../logging/structured-logger';

/** One outbound message, provider-agnostic. */
interface IMailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * The provider seam. The notification service depends on this rather than on a provider SDK,
 * so the transport can be swapped and the tests can drive a real one without a live provider.
 */
interface IMailTransport {
  send(message: IMailMessage): Promise<void>;
}

/** The DI token for the transport, so the module can choose the implementation. */
const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/**
 * The transport when no provider is configured.
 *
 * It fails rather than silently dropping: a notification the operator believes was sent and
 * that was not is worse than a visible failure, and FR-036 requires the failure to be
 * surfaced. The booking is never touched, so nothing is lost either way.
 */
class UnconfiguredMailTransport implements IMailTransport {
  async send(): Promise<never> {
    throw new Error('The mail provider is not configured (set MAIL_ENDPOINT and MAIL_FROM)');
  }
}

/** The provider settings, read from the server environment (FR-035). */
interface IMailConfig {
  endpoint: string;
  apiKey?: string;
  from: string;
}

/**
 * An HTTP transport: the message is POSTed as JSON to the configured endpoint.
 *
 * A generic HTTP seam keeps the provider choice out of the code — the operator points
 * `MAIL_ENDPOINT` at whatever relay or provider API they use — and needs no dependency beyond
 * the platform's `fetch`. The provider credentials live in the server environment and never
 * reach the client bundle (FR-035, SC-007).
 *
 * A non-2xx response and a timeout both fail the send. The timeout matters: without it a
 * hanging provider would hold the request until the platform's own timeout, and the operator
 * would see a stalled request rather than a surfaced failure.
 */
class HttpMailTransport implements IMailTransport {
  constructor(
    private readonly config: IMailConfig,
    private readonly logger: StructuredLogger,
    private readonly timeoutMs = 10_000
  ) {}

  async send(message: IMailMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? {authorization: `Bearer ${this.config.apiKey}`} : {}),
        },
        body: JSON.stringify({
          from: this.config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      // The provider address is deliberately not logged here; the caller logs the failure with
      // the booking it belonged to, and the recipient address is left to the logger's redaction.
      throw new Error(`Mail provider request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Mail provider answered ${response.status}`);
    }
  }
}

export {MAIL_TRANSPORT, UnconfiguredMailTransport, HttpMailTransport};
export type {IMailTransport, IMailMessage, IMailConfig};
