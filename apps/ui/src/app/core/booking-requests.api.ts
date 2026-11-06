import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IBooking, IBookingRequest} from '@models/booking.model';
import {Observable} from 'rxjs';

/**
 * The booking write the request form uses.
 *
 * `POST /bookings` is public (T023): an anonymous visitor may submit a request, and the
 * server stores it unapproved (`accepted: false`) and unarchived. The service takes the
 * request body the shared model declares rather than a hand-built object, so the form cannot
 * send a field the contract does not allow — `whitelist`/`forbidNonWhitelisted` would reject
 * it, and the failure would surface as a generic `422` after the visitor had filled the form.
 *
 * The RODO acknowledgement travels in the body; the server requires it for a public caller and
 * records it on the booking. It is part of `IBookingRequest`, so a form cannot forget it and
 * still type-check.
 */
@Injectable({providedIn: 'root'})
export class BookingRequestsApi {
  private readonly http = inject(HttpClient);

  create(request: IBookingRequest): Observable<IBooking> {
    return this.http.post<IBooking>('/api/bookings', request);
  }
}
