import { computed, Injectable, signal } from '@angular/core';
import { IAuthenticatedUser, IUserCapabilities, TUserRole } from '@models/user.model';

const TOKEN_KEY = 'book-space.token';
const USER_KEY = 'book-space.user';

/**
 * Holds the signed-in session: the bearer token and the user it belongs to.
 *
 * A signal store rather than an RxJS subject because every consumer is a
 * template or a guard, both of which read the current value synchronously.
 * Persistence is what lets a reload keep the session; it is deliberately
 * `localStorage` so a closed tab is still signed in, matching the legacy app.
 *
 * The user is the API's `IAuthenticatedUser`, which carries the capabilities the
 * server resolved. Persisting them means the navigation renders correctly on the first
 * paint after a reload; `AuthService.restore()` refreshes them from `/auth/me` as soon as
 * the app starts, so a role or deny-list change is picked up without a re-sign-in.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly tokenSignal = signal<string | null>(readStorage(TOKEN_KEY));
  private readonly userSignal = signal<IAuthenticatedUser | null>(readJson<IAuthenticatedUser>(USER_KEY));

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);
  readonly role = computed<TUserRole | null>(() => this.userSignal()?.role ?? null);
  readonly capabilities = computed<IUserCapabilities | null>(
    () => this.userSignal()?.capabilities ?? null
  );

  set(token: string, user: IAuthenticatedUser): void {
    this.tokenSignal.set(token);
    this.userSignal.set(user);
    writeStorage(TOKEN_KEY, token);
    writeStorage(USER_KEY, JSON.stringify(user));
  }

  /**
   * Replaces the stored user with a freshly resolved one, keeping the token.
   *
   * `/auth/me` returns no token — the client already holds it — so restoring the session
   * after a reload has to update the user without touching the token, or the caller would
   * be signed out by the very request that refreshed them.
   */
  setUser(user: IAuthenticatedUser): void {
    this.userSignal.set(user);
    writeStorage(USER_KEY, JSON.stringify(user));
  }

  clear(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    removeStorage(TOKEN_KEY);
    removeStorage(USER_KEY);
  }
}

// Storage is read defensively: a sandboxed iframe or a browser with storage
// disabled throws on access, and a session store must not take the app down with
// it. A missing session is the correct fallback in every one of those cases.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const raw = readStorage(key);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt value is treated as no session rather than crashing the shell.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; the in-memory signal is already updated.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // See `writeStorage`.
  }
}
