import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IClientSummary, ISummaryQuery} from '@models/reporting.model';
import {Observable} from 'rxjs';

/**
 * Adds a query parameter only when the value is present.
 *
 * `HttpParams` serialises everything to a string, so a boolean is sent as `'true'`/`'false'` —
 * the server's `@BooleanQuery()` reads the raw string. `fromMonth`/`toMonth` are sent as ISO
 * instants, which the server's `@Type(() => Date)` parses back; omitting an absent key is what
 * lets the "from the beginning" request carry no bounds at all.
 */
const setIfPresent = (
  params: HttpParams,
  key: string,
  value: string | boolean | Date | undefined
): HttpParams => {
  if (value === undefined) {
    return params;
  }
  return params.set(key, value instanceof Date ? value.toISOString() : String(value));
};

/**
 * The reporting reads and the CSV export (FR-027–FR-029).
 *
 * `GET /reporting/summary` answers the per-client, per-city summary; `GET /reporting/summary.csv`
 * answers the CSV. One route serves both exports — a `clientId` exports one client, omitting it
 * exports every client with accepted bookings in range — so the service exposes `summary` and
 * `summaryCsv`, and the CSV method takes the same query the summary does.
 *
 * The CSV is fetched as text, not as a Blob: the server already sends the `\uFEFF` BOM and the
 * CRLF line endings as part of the body, so a Blob round-trip would only re-wrap bytes the
 * server produced. The UI writes the text to a download, keeping the server the one place that
 * decides the file's content (R7).
 *
 * The endpoints are `OFFICE`/`ADMIN` (FR-006); the server
 * enforces both, so the tab renders the controls the capabilities allow and the server refuses
 * anything else.
 */
@Injectable({providedIn: 'root'})
export class ReportingApi {
  private readonly http = inject(HttpClient);

  /** One client's summary grouped by city (FR-027). */
  summary(query: ISummaryQuery): Observable<IClientSummary> {
    return this.http.get<IClientSummary>('/api/reporting/summary', {params: this.params(query)});
  }

  /**
   * The CSV export (FR-028, FR-029): one client when `clientId` is set, every client otherwise.
   *
   * `responseType: 'text'` keeps the server's BOM and CRLF intact; the caller turns the string
   * into a download with the filename the report contract specifies.
   */
  summaryCsv(query: ISummaryQuery): Observable<string> {
    return this.http.get('/api/reporting/summary.csv', {
      params: this.params(query),
      responseType: 'text',
    });
  }

  private params(query: ISummaryQuery): HttpParams {
    const keys = ['clientId', 'fromMonth', 'toMonth', 'fromTheBeginning'] as const;
    return keys.reduce((acc, key) => setIfPresent(acc, key, query[key]), new HttpParams());
  }
}
