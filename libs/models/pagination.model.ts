/**
 * The list envelope from `contracts/openapi.yaml`. List endpoints return this
 * rather than a bare array, so a client can page without a second request and
 * the response shape does not change when a filter is added.
 */
interface IPaginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export {IPaginated};
