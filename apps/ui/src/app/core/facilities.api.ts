import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IBuilding, IFacilityRequest, IFacilityUpdateRequest, IPublicBuilding} from '@models/building.model';
import {Observable} from 'rxjs';

/**
 * The facility list the calendar's selectors and the booking form need.
 *
 * `GET /buildings` is public (T034): an anonymous caller receives the facility identity and
 * its rentable sizes, with the contact details and the employee list removed. The service
 * is the UI's single entry point to that read, so a future screen cannot call the endpoint
 * with a different shape or a hand-built URL.
 *
 * The route is one at two levels of detail (the same shape `GET /bookings` uses): a staff
 * caller receives the full record. `list()` types the public shape and is what the calendar
 * and booking form use; `listStaff()` types the full record and is what the Facilities tab
 * uses. Both hit the same URL — the bearer token the interceptor attaches is what selects
 * the response — but naming the two shapes keeps a screen from reading `email` off a value
 * typed as public, which would be a field the server had already removed.
 */
@Injectable({providedIn: 'root'})
export class FacilitiesApi {
  private readonly http = inject(HttpClient);

  /** The public read: identity, sizes and the lighting/toilets flags. */
  list(): Observable<IPublicBuilding[]> {
    return this.http.get<IPublicBuilding[]>('/api/buildings');
  }

  /** The staff read: the full record, including the contact details and the employee list. */
  listStaff(): Observable<IBuilding[]> {
    return this.http.get<IBuilding[]>('/api/buildings');
  }

  /**
   * The writes (FR-010, T272). Administrator-only on the server; the Facilities tab decides
   * which controls to render from `canWriteFacilities`, and the server enforces the same rule.
   */
  create(body: IFacilityRequest): Observable<IBuilding> {
    return this.http.post<IBuilding>('/api/buildings', body);
  }

  update(_id: string, body: IFacilityUpdateRequest): Observable<unknown> {
    return this.http.put<unknown>(`/api/buildings/${_id}`, body);
  }

  remove(_id: string): Observable<unknown> {
    return this.http.delete<unknown>(`/api/buildings/${_id}`);
  }
}
