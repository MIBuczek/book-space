import { Injectable, signal } from '@angular/core';

const ACKNOWLEDGEMENT_KEY = 'book-space.cookies-acknowledged';

/**
 * Remembers the visitor's cookie-notice acknowledgement (FR-040).
 *
 * The legacy `Cookies.tsx` wrote `localStorage.setItem('cookies', 'false')` and then
 * tested `if (!userCookies)`: `'false'` is a non-empty string, so it read as *not*
 * acknowledged and the notice reappeared on every reload. The value it wrote contradicted
 * the state it meant to record.
 *
 * Here the stored value is the acknowledgement itself — the string `'true'` — and the check
 * is an equality test, so there is no truthiness to get wrong. The store is the single place
 * that reads the key, and storage access is wrapped because a sandboxed iframe or a
 * storage-disabled browser throws on access; a missing acknowledgement is the correct
 * fallback there.
 */
@Injectable({ providedIn: 'root' })
export class CookieNoticeStore {
  private readonly acknowledgedSignal = signal(readAcknowledged());

  readonly acknowledged = this.acknowledgedSignal.asReadonly();

  /** Records the acknowledgement and hides the notice. */
  acknowledge(): void {
    this.acknowledgedSignal.set(true);
    try {
      localStorage.setItem(ACKNOWLEDGEMENT_KEY, 'true');
    } catch {
      // Persistence is best-effort; the in-memory signal already hides the notice.
    }
  }
}

function readAcknowledged(): boolean {
  try {
    return localStorage.getItem(ACKNOWLEDGEMENT_KEY) === 'true';
  } catch {
    return false;
  }
}
