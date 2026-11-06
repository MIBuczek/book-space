import {currentAcademicYearRange} from '@booking/date-time';
import {escapeRegExp} from '../../utility/escape-regexp';

/**
 * Booking-list scoping and pagination (FR-020, FR-022, FR-043, research.md R9).
 *
 * The list read used to return every booking. This module decides *which* bookings a
 * request may load and how many of them, as pure functions, so the two rules that carry
 * a security consequence are unit-testable rather than reachable only through a request:
 *
 *  - an anonymous caller must name a period, and
 *  - a staff caller who names none gets the current academic year rather than everything.
 *
 * The functions return plain values; the service turns them into a Mongoose query. That
 * split keeps the Mongoose `Model` out of the controller (backend-conventions §4).
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Raised when an anonymous caller asks for the list without a period.
 *
 * A distinct type rather than a `400`: the controller maps it to the contract's `422`,
 * and a caller cannot accidentally swallow it by catching a broad `Error`.
 */
class BookingRangeRequiredError extends Error {
  constructor() {
    super('A date range (from and to) is required');
    this.name = 'BookingRangeRequiredError';
  }
}

interface IListRangeInput {
  from?: Date;
  to?: Date;
  /** Staff-only: load every record rather than the default academic year. */
  all?: boolean;
}

interface IListRange {
  from?: Date;
  to?: Date;
}

/**
 * The date range a list request resolves to, or the reason it has none.
 *
 * - An anonymous caller must supply both bounds; either missing is refused. This is the
 *   fail-closed half: the public calendar is the one path an unauthenticated caller can
 *   reach, so an unbounded read there would expose the whole history.
 * - A staff caller who supplies neither bound gets the current academic year (R9). The
 *   default is a *performance* measure, not an authorization boundary — staff may read
 *   the whole history, and `all` is how they ask for it.
 * - Each bound is defaulted independently, so `from` alone means "from that date to the
 *   end of the current academic year". A period picker sends both; a caller who sends one
 *   gets the academic year's other end rather than an unbounded one.
 * - `all` clears both bounds. It wins over an explicit bound, because it is the more
 *   specific request.
 */
const resolveListRange = (input: IListRangeInput, options: {staff: boolean; now: Date}): IListRange => {
  if (!options.staff) {
    if (!input.from || !input.to) {
      throw new BookingRangeRequiredError();
    }
    return {from: input.from, to: input.to};
  }

  if (input.all) {
    return {};
  }

  const academic = currentAcademicYearRange(options.now);
  return {from: input.from ?? academic.from, to: input.to ?? academic.to};
};

interface IPagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Normalises `page`/`limit` and derives the offset.
 *
 * `limit` is capped rather than rejected when it exceeds the maximum, so a caller that
 * asks for more than the contract allows still gets a bounded, well-formed page. The DTO
 * rejects an out-of-range `limit` before this runs; the cap is the belt to that braces,
 * for any future caller that does not go through the DTO.
 */
const resolvePagination = ({page, limit}: {page?: number; limit?: number}): IPagination => {
  const resolvedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const resolvedPage = page ?? 1;
  return {page: resolvedPage, limit: resolvedLimit, skip: (resolvedPage - 1) * resolvedLimit};
};

/**
 * The fields the service turns into a query. `accepted` is optional because a staff
 * caller who does not filter on it should see both states; the public caller always sets
 * it, and `archive` is always present because it defaults to `false` for everyone.
 */
interface IBookingListFilter {
  from?: Date;
  to?: Date;
  city?: string;
  building?: string;
  accepted?: boolean;
  archive: boolean;
  clientId?: string;
  /** Tenant-name search (FR-021), matched case-insensitively against `personName`. */
  search?: string;
}

/**
 * The raw query a request may carry, after DTO validation. Mirrors `BookingQueryDto`
 * without importing it, so this module stays free of Nest and is unit-testable on its
 * own.
 */
interface IBookingListRequest {
  from?: Date;
  to?: Date;
  city?: string;
  building?: string;
  accepted?: boolean;
  archive?: boolean;
  clientId?: string;
  search?: string;
  page?: number;
  limit?: number;
  all?: boolean;
}

/**
 * Resolves a validated query into the filter and the page to run.
 *
 * This is the one place the two caller scopes are told apart, so the public half cannot
 * drift from the staff half:
 *
 *  - The public filter forces `accepted: true` and `archive: false` rather than reading
 *    them from the query. FR-005 is a rule about what an anonymous caller may see, not a
 *    default they may override with `?archive=true`; a public request that asks for the
 *    archive gets the same public calendar.
 *  - `clientId` is a staff filter (reporting), so the public branch drops it. It only
 *    narrows an already-public set, but a public caller has no reason to name a client
 *    and the contract lists it for staff.
 *  - The range rule lives in `resolveListRange`, so an anonymous request without a period
 *    is refused here, before any query runs.
 */
const resolveBookingListRequest = (
  input: IBookingListRequest,
  options: {staff: boolean; now: Date}
): {filter: IBookingListFilter; pagination: IPagination} => {
  const range = resolveListRange(input, options);
  const pagination = resolvePagination(input);

  const filter: IBookingListFilter = options.staff
    ? {
        ...range,
        city: input.city,
        building: input.building,
        accepted: input.accepted,
        archive: input.archive ?? false,
        clientId: input.clientId,
        search: input.search,
      }
    : {
        ...range,
        city: input.city,
        building: input.building,
        accepted: true,
        archive: false,
      };

  return {filter, pagination};
};

/**
 * Turns the filter into a MongoDB query document.
 *
 * Pure and exported so the mapping is unit-testable without a database, and so the
 * service stays a thin wrapper. Every branch is an "add the key only when present":
 * a key set to `undefined` is dropped by the driver, but building it explicitly keeps
 * the intended query readable in a failing assertion.
 *
 * The period maps to `createdAt`, matching the legacy `getBookingsDataByDate`. `from`
 * and `to` are inclusive, which is why they are `$gte`/`$lte`: a period is "1 Aug to
 * 31 Aug" and a booking created at any instant on 31 Aug belongs to it.
 */
const buildBookingQuery = (filter: IBookingListFilter): Record<string, unknown> => {
  const query: Record<string, unknown> = {archive: filter.archive};
  if (filter.accepted !== undefined) {
    query.accepted = filter.accepted;
  }
  if (filter.city !== undefined) {
    query['place.city'] = filter.city;
  }
  if (filter.building !== undefined) {
    query['place.place'] = filter.building;
  }
  if (filter.clientId !== undefined) {
    query.clientId = filter.clientId;
  }
  if (filter.search !== undefined && filter.search.trim() !== '') {
    // Substring match on the tenant name (FR-021). The legacy search matched `person`
    // case-insensitively with `includes`; the same semantics here are a case-insensitive
    // regex, with the term escaped so it is a substring rather than a pattern. `nick` is
    // not searched: FR-021 names the tenant name, and `nick` is a public calendar label,
    // not an identifier staff look a booking up by.
    query.personName = {$regex: escapeRegExp(filter.search.trim()), $options: 'i'};
  }
  if (filter.from !== undefined || filter.to !== undefined) {
    const range: Record<string, Date> = {};
    if (filter.from !== undefined) {
      range.$gte = filter.from;
    }
    if (filter.to !== undefined) {
      range.$lte = filter.to;
    }
    query.createdAt = range;
  }
  return query;
};

export {
  resolveListRange,
  resolvePagination,
  resolveBookingListRequest,
  buildBookingQuery,
  BookingRangeRequiredError,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
export type {IListRangeInput, IListRange, IPagination, IBookingListFilter, IBookingListRequest};
