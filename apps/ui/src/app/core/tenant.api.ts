import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ITenant } from '@models/tenant.model';
import { Observable } from 'rxjs';

/**
 * The tenant identity the UI renders (FR-007, contracts/tenant.md).
 *
 * `GET /api/tenant` is public — the footer and the contact page render on the pages an anonymous
 * visitor sees — so the request carries no credential and needs no interceptor.
 */
@Injectable({ providedIn: 'root' })
export class TenantApi {
  private readonly http = inject(HttpClient);

  get(): Observable<ITenant> {
    return this.http.get<ITenant>('/api/tenant');
  }
}
