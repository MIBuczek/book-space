import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IBooking} from '@models/booking.model';
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
 * The bookings read the calendar uses.
 *
 * `GET /bookings` is one route at two levels of detail (public and staff), so the service
 * takes the period the public caller must supply and the facility it is showing. The API
 * redacts the tenant's personal fields for an anonymous caller; the service never asks for
 * them, so a screen cannot render what it is not entitled to.
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
}

export type {IBookingListQuery};
