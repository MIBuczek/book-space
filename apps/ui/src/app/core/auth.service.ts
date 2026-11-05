import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { IUser } from '@models/user.model';
import { SessionStore } from './session.store';

interface ISignInResponse {
  user: IUser;
  token: string;
}

interface ISignInRequest {
  email: string;
  password: string;
}

/**
 * Sign-in and sign-out against the API.
 *
 * The service owns the request shape and the session write; a component only
 * collects the credentials and reacts to the result. The token is stored in
 * `SessionStore`, never in component state, so a reload keeps the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  signIn(request: ISignInRequest): Observable<IUser> {
    return this.http.post<ISignInResponse>('/api/auth/sign-in', request).pipe(
      tap((response) => this.session.set(response.token, response.user)),
      map((response) => response.user)
    );
  }

  /**
   * Sign-out is stateless on the server (`GET /auth/sign-out` destroys no
   * session), so the local session is cleared regardless of the response. The
   * request is still sent so a cookie-based caller is cleaned up too.
   */
  signOut(): Observable<unknown> {
    const done = this.http.get<{ message: string }>('/api/auth/sign-out');
    return done.pipe(tap({ complete: () => this.session.clear(), error: () => this.session.clear() }));
  }
}
