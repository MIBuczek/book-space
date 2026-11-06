import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IPublicBuilding} from '@models/building.model';
import {Observable} from 'rxjs';

/**
 * The facility list the calendar's selectors and the booking form need.
 *
 * `GET /buildings` is public (T034): an anonymous caller receives the facility identity and
 * its rentable sizes, with the contact details and the employee list removed. The service
 * is the UI's single entry point to that read, so a future screen cannot call the endpoint
 * with a different shape or a hand-built URL.
 */
@Injectable({providedIn: 'root'})
export class FacilitiesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<IPublicBuilding[]> {
    return this.http.get<IPublicBuilding[]>('/api/buildings');
  }
}
