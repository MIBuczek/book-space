import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IUser, IUserRequest, IUserUpdateRequest} from '@models/user.model';
import {Observable} from 'rxjs';

/**
 * The staff-account read and write (FR-045).
 *
 * Every route is administrator-only and the server enforces it; the Users tab only decides which
 * controls to render. The service is the UI's single entry point to `/users`, so a screen cannot
 * call the endpoint with a different shape or a hand-built URL.
 *
 * `GET /users` answers a bare array rather than the `{items, total, page, limit}` envelope the
 * client and booking lists use (FR-043's paging applies to those reads, not to this one): the
 * staff directory is a bounded set — the accounts an administrator has created — not a
 * collection that grows with tenant activity, so there is nothing to page.
 */
@Injectable({providedIn: 'root'})
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(): Observable<IUser[]> {
    return this.http.get<IUser[]>('/api/users');
  }

  create(body: IUserRequest): Observable<IUser> {
    return this.http.post<IUser>('/api/users', body);
  }

  update(_id: string, body: IUserUpdateRequest): Observable<unknown> {
    return this.http.put<unknown>(`/api/users/${_id}`, body);
  }

  /**
   * Deactivates an account (`active: false`), which is the preferred removal (FR-047).
   *
   * It is a `PUT` rather than the `DELETE` route because the contract recommends deactivation so
   * a booking's audit reference survives: the account stops being able to sign in, and the records
   * it created stay attributable. The `DELETE` route remains for an account created in error,
   * which the tab does not offer because deleting an account that has ever acted is what the rule
   * exists to avoid.
   */
  deactivate(_id: string): Observable<unknown> {
    return this.update(_id, {active: false});
  }
}

