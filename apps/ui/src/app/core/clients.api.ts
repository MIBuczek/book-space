import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IClient, IClientRequest} from '@models/client.model';
import {IPaginated} from '@models/pagination.model';
import {EMPTY, Observable, expand, reduce} from 'rxjs';

/** The filters the Clients tab's list read accepts (FR-022, FR-024, FR-043). */
interface IClientListQuery {
  /** Substring matched against name, contact person, e-mail and phone. */
  search?: string;
  page?: number;
  limit?: number;
}

/** Adds a query parameter only when the value is present. */
const setIfPresent = (
  params: HttpParams,
  key: string,
  value: string | number | undefined
): HttpParams => (value === undefined ? params : params.set(key, String(value)));

/**
 * The clients read and write (FR-024, FR-025, FR-026).
 *
 * `GET /clients` answers the `{items, total, page, limit}` envelope and is paged and
 * searchable server-side (issue #123): the legacy `Clients.tsx` downloaded the whole
 * collection and filtered in the browser, which FR-043 forbids. The service is the UI's
 * single entry point to the endpoint, so a screen cannot call it with a different shape
 * or a hand-built URL.
 *
 * The writes are the administrator half of FR-024; the server enforces the role, and the
 * tab only decides which controls to render.
 */
@Injectable({providedIn: 'root'})
export class ClientsApi {
  private readonly http = inject(HttpClient);

  /** Lists clients, paged and searchable. An absent filter is one the server does not apply. */
  list(query: IClientListQuery = {}): Observable<IPaginated<IClient>> {
    const keys = ['search', 'page', 'limit'] as const;
    const params = keys.reduce((acc, key) => setIfPresent(acc, key, query[key]), new HttpParams());

    return this.http.get<IPaginated<IClient>>('/api/clients', {params});
  }

  /**
   * Every client, for a control that needs the whole collection (the Summary tab's selector).
   *
   * It walks the pages with `expand` rather than requesting a huge `limit`: FR-043 forbids an
   * unbounded read, and the server caps `limit` at 200. Fetching page by page keeps each request
   * inside the documented bounds while still giving the caller one list, and it stops when the
   * page returns fewer rows than asked for (the last page). The selector needs names, not a
   * paged view, so collecting them here is the one place this pattern is allowed.
   */
  listAll(): Observable<IClient[]> {
    const pageSize = 200;
    return this.list({page: 1, limit: pageSize}).pipe(
      expand((page) =>
        page.items.length < pageSize ? EMPTY : this.list({page: page.page + 1, limit: pageSize})
      ),
      reduce((clients, page) => [...clients, ...page.items], [] as IClient[])
    );
  }

  create(body: IClientRequest): Observable<IClient> {
    return this.http.post<IClient>('/api/clients', body);
  }

  update(_id: string, body: Partial<IClientRequest>): Observable<unknown> {
    return this.http.put<unknown>(`/api/clients/${_id}`, body);
  }

  remove(_id: string): Observable<unknown> {
    return this.http.delete<unknown>(`/api/clients/${_id}`);
  }
}

export type {IClientListQuery};
