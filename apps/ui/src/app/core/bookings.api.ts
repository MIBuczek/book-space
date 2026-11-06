import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IBooking, IBookingRequest} from '@models/booking.model';
import {IBookedTime} from '@models/booked-time.model';
import {IPaginated} from '@models/pagination.model';
import {Observable} from 'rxjs';

/** The filters the calendar's list read accepts. */
interface IBookingListQuery {
  city: string;
  building: string;
  /** Inclusive lower bound of the `createdAt` period. */
  from: Date;
  /** Inclusive upper bound of the `createdAt` period. */
  to: Date;
}

/**
 * The filters the admin bookings table accepts (FR-020, FR-021, FR-022).
 *
 * Every field is optional, unlike the calendar's query: staff may read the whole
 * academic year, and a missing period is the server's default rather than a `422`.
 * `all` is the "from the beginning" loader and is administrator-only server-side.
 */
interface IAdminBookingQuery {
  city?: string;
  building?: string;
  from?: Date;
  to?: Date;
  accepted?: boolean;
  archive?: boolean;
  /** Tenant-name substring (FR-021). */
  search?: string;
  page?: number;
  limit?: number;
  all?: boolean;
}

/** The scope the conflict counter is computed over: one facility, one period. */
interface IConflictQuery {
  city: string;
  building: string;
  from: Date;
  to: Date;
}

/** The `POST /bookings/{_id}/approve` response (FR-017). */
interface IApprovalResult {
  booking: IBooking;
  /** The conflicts that remain after a forced approval. */
  conflicts: string[];
}

/**
 * Adds a query parameter only when the value is present.
 *
 * `HttpParams` serialises everything to a string, so a boolean must be sent as
 * `'true'`/`'false'` — the server's `@BooleanQuery()` reads the raw string. Skipping an
 * absent value is what lets one builder serve the optional admin filters and the required
 * calendar period: an omitted key is a filter the server does not apply, not a `'undefined'`.
 */
const setIfPresent = (
  params: HttpParams,
  key: string,
  value: string | number | boolean | Date | undefined
): HttpParams => {
  if (value === undefined) {
    return params;
  }
  return params.set(key, value instanceof Date ? value.toISOString() : String(value));
};

/**
 * The bookings read and the administrator decision routes.
 *
 * `GET /bookings` is one route at two levels of detail (public and staff), so the service
 * takes the period the public caller must supply and the facility it is showing. The API
 * redacts the tenant's personal fields for an anonymous caller; the service never asks for
 * them, so a screen cannot render what it is not entitled to.
 *
 * The admin methods are the write half of FR-017: approve/unapprove, archive/restore, the
 * generic edit, the slot replacement that both reschedules and resolves, and delete. Each
 * is one route the server enforces; the UI only decides which button calls which.
 * `replaceSlots` is deliberately one method for two actions — the contract's
 * `PUT /bookings/{_id}/booked-times` replaces the whole list, so a reschedule and a resolve
 * are the same write with a different slot changed, and splitting them here would be two
 * names for one request.
 */
@Injectable({providedIn: 'root'})
export class BookingsApi {
  private readonly http = inject(HttpClient);

  /**
   * Lists bookings for one facility over a period.
   *
   * `from`/`to` are required: the API answers `422` to an anonymous caller that names no
   * period, and the calendar always has one (the week or day on screen).
   */
  list(query: IBookingListQuery): Observable<IPaginated<IBooking>> {
    const params = new HttpParams()
      .set('city', query.city)
      .set('building', query.building)
      .set('from', query.from.toISOString())
      .set('to', query.to.toISOString());

    return this.http.get<IPaginated<IBooking>>('/api/bookings', {params});
  }

  /** The staff list, with the period loader, the unapproved filter and the name search. */
  listAdmin(query: IAdminBookingQuery): Observable<IPaginated<IBooking>> {
    const keys = ['city', 'building', 'from', 'to', 'accepted', 'archive', 'search', 'page', 'limit', 'all'] as const;
    const params = keys.reduce((acc, key) => setIfPresent(acc, key, query[key]), new HttpParams());

    return this.http.get<IPaginated<IBooking>>('/api/bookings', {params});
  }

  /** The ids of the unaccepted bookings that conflict within one facility and period (FR-015). */
  conflicts(query: IConflictQuery): Observable<string[]> {
    const params = new HttpParams()
      .set('city', query.city)
      .set('building', query.building)
      .set('from', query.from.toISOString())
      .set('to', query.to.toISOString());

    return this.http.get<string[]>('/api/bookings/conflicts', {params});
  }

  /** Approves or unapproves a booking; `force` confirms an approval that keeps a conflict. */
  approve(_id: string, accepted: boolean, force = false): Observable<IApprovalResult> {
    return this.http.post<IApprovalResult>(`/api/bookings/${_id}/approve`, {accepted, force});
  }

  /** Archives or restores a booking. */
  archive(_id: string, archive: boolean): Observable<IBooking> {
    return this.http.post<IBooking>(`/api/bookings/${_id}/archive`, {archive});
  }

  /** The generic edit. The server strips the fields that have their own route. */
  update(_id: string, body: Partial<IBookingRequest>): Observable<IBooking> {
    return this.http.put<IBooking>(`/api/bookings/${_id}`, body);
  }

  /** Replaces the complete slot list; a resolved slot must appear unchanged (FR-018). */
  replaceSlots(_id: string, slots: IBookedTime[]): Observable<unknown> {
    return this.http.put<unknown>(`/api/bookings/${_id}/booked-times`, slots);
  }

  remove(_id: string): Observable<unknown> {
    return this.http.delete<unknown>(`/api/bookings/${_id}`);
  }
}

export type {IBookingListQuery, IAdminBookingQuery, IConflictQuery, IApprovalResult};

