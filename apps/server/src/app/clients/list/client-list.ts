import {escapeRegExp} from '../../utility/escape-regexp';
import {DEFAULT_LIMIT, IPagination, resolvePagination} from '../../bookings/list/booking-list';

/**
 * Client-list scoping and search (FR-022, FR-024, FR-043, issue #123).
 *
 * The clients read used to return the whole collection — the legacy `Clients.tsx` downloaded
 * every client and filtered in the browser (`searchSelectedContent`, `pagination`). FR-043
 * forbids an endpoint that returns everything by default, so the read is paged and searchable
 * server-side, with the same `{items, total, page, limit}` envelope and page defaults the
 * booking list uses (`resolvePagination` is reused rather than copied, so the two reads cannot
 * disagree on a default or a cap).
 *
 * The search is a substring match over the fields staff look a client up by: `name` (the
 * legacy `searchSelectedContent(clients, 'name', …)`), plus the contact person, e-mail and
 * phone the issue's acceptance criteria name.
 */

/** The raw query a request may carry, after DTO validation. */
interface IClientListRequest {
  search?: string;
  page?: number;
  limit?: number;
}

/** The fields the search matches, in the order a result is most likely to have been meant. */
const SEARCH_FIELDS = ['name', 'contactPerson', 'email', 'phone'] as const;

/** The resolved filter for a client list request. */
interface IClientListFilter {
  search?: string;
}

/** Resolves a validated query into the filter and the page to run. */
const resolveClientListRequest = (
  input: IClientListRequest
): {filter: IClientListFilter; pagination: IPagination} => ({
  filter: {search: input.search},
  pagination: resolvePagination(input),
});

/**
 * Turns the filter into a MongoDB query document.
 *
 * Pure and exported so the mapping is unit-testable without a database. An empty or
 * whitespace-only term is dropped rather than compiled: a `$regex: ''` matches every record,
 * which would look like a working search that returns everything. The term is escaped so it is
 * a substring, not a pattern (the shared `escapeRegExp`), and `$or` over the four fields is
 * what makes one search box find a client by name, contact, e-mail or phone.
 */
const buildClientQuery = (filter: IClientListFilter): Record<string, unknown> => {
  const term = filter.search?.trim();
  if (term === undefined || term === '') {
    return {};
  }
  const pattern = {$regex: escapeRegExp(term), $options: 'i'};
  return {$or: SEARCH_FIELDS.map((field) => ({[field]: pattern}))};
};

export {resolveClientListRequest, buildClientQuery, SEARCH_FIELDS, DEFAULT_LIMIT};
export type {IClientListRequest, IClientListFilter};
