import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { IAuthenticatedUser } from '@models/user.model';
import { SessionStore } from './session.store';

interface ISignInResponse {
  user: IAuthenticatedUser;
  token: string;
}

interface ISignInRequest {
  email: string;
  password: string;
}

/**
 * Sign-in, sign-out and session restoration against the API.
 *
 * The service owns the request shape and the session write; a component only
 * collects the credentials and reacts to the result. The token is stored in
 * `SessionStore`, never in component state, so a reload keeps the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  signIn(request: ISignInRequest): Observable<IAuthenticatedUser> {
    return this.http.post<ISignInResponse>('/api/auth/sign-in', request).pipe(
      tap((response) => this.session.set(response.token, response.user)),
      map((response) => response.user)
    );
  }

  /**
   * Fetches the current user with the capabilities resolved from the database.
   *
   * The token is already attached by `authInterceptor`, so this takes no argument.
   */
  me(): Observable<IAuthenticatedUser> {
    return this.http.get<IAuthenticatedUser>('/api/auth/me');
  }

  /**
   * Refreshes the stored user from `/auth/me` on application start.
   *
   * Called from an app initializer so the session is revalidated before the first route
   * resolves: a token that has expired or belongs to a deactivated account is discarded
   * here, and a role change is reflected in the navigation immediately. It
   * completes rather than errors when the token is rejected — `errorInterceptor` already
   * clears the session and routes to sign-in, and an initializer that threw would abort
   * bootstrap and blank the page.
   */
  restore(): Observable<IAuthenticatedUser | null> {
    if (!this.session.isAuthenticated()) {
      return of(null);
    }

    return this.me().pipe(
      tap((user) => this.session.setUser(user)),
      catchError(() => {
        // The interceptor clears the session for a 401; clearing here too covers a
        // network failure, so a stale token cannot leave the app half signed in.
        this.session.clear();
        return of(null);
      })
    );
  }

  /**
   * Sign-out is stateless on the server (`GET /auth/sign-out` destroys no
   * session), so the local session is cleared regardless of the response. The
   * request is still sent so a cookie-based caller is cleaned up too.
   */
  signOut(): Observable<unknown> {
    const done = this.http.get<{ message: string }>('/api/auth/sign-out');
    return done.pipe(
      tap({ complete: () => this.session.clear(), error: () => this.session.clear() })
    );
  }
}
