import {CanActivate, ExecutionContext, Injectable, UnprocessableEntityException} from '@nestjs/common';

/** The decoy field a script fills in and a human never sees. */
export const HONEYPOT_FIELD = 'website';

/**
 * Rejects a submission that filled in the hidden decoy field (FR-049).
 *
 * This is the bot-mitigation choice, and it is deliberately not a CAPTCHA. A CAPTCHA would
 * put a visual puzzle in front of the visitor and break NFR-006 (the form must remain usable
 * without sight, a mouse or a fast connection); a honeypot costs the visitor nothing, needs no
 * third party, and is invisible to anyone using the form as intended.
 *
 * The field is named `website` and rendered off-screen by the UI (positioned out of view, not
 * `display: none`, so a naive bot that skips hidden fields still finds it). A human never
 * sees it and leaves it empty; a script that fills every input it finds submits it non-empty.
 * A non-empty value is answered `422`, the same status as any other bad field, so the response
 * tells the bot nothing about why it was refused.
 *
 * The check is a *guard*, not a DTO rule, because the rule has to inspect the raw value and a
 * single-field guard keeps the refusal in one place. The field is declared `optional` on the
 * DTO so `whitelist`/`forbidNonWhitelisted` do not reject it as an unknown property before
 * this guard could read it; the *value* rule lives here.
 */
@Injectable()
export class HoneypotGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{body?: Record<string, unknown>}>();
    const value = request.body?.[HONEYPOT_FIELD];

    // A filled-in decoy is refused. A missing one is the normal case; a `''` is what the real
    // form submits, and is allowed.
    if (typeof value === 'string' && value.trim() !== '') {
      throw new UnprocessableEntityException('The form could not be processed');
    }
    return true;
  }
}
