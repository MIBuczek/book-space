import * as Validator from 'class-validator';

/**
 * The query for `GET /clients` (contracts/openapi.yaml, FR-022, FR-024, FR-043, issue #123).
 *
 * Every field is optional: a request with no `search` lists the first page of every client,
 * and a request with no `page`/`limit` gets the shared defaults (`resolvePagination`). The
 * read is paged so no endpoint returns the whole collection by default (FR-043), which is the
 * gap issue #123 records: the legacy list downloaded every client and filtered in the browser.
 *
 * `search` is bounded in length like the booking list's, so a pathological term is refused at
 * the boundary rather than turned into an unbounded regex.
 */
export class ClientQueryDto {
  @Validator.IsOptional()
  @Validator.IsString({
    message: 'Search need to be a string.'
  })
  @Validator.MaxLength(125, {
    message: 'Search can have maximal 125 characters.'
  })
  search?: string;

  @Validator.IsOptional()
  @Validator.IsInt({
    message: 'Page need to be an integer.'
  })
  @Validator.Min(1, {
    message: 'Page can not be lower than 1.'
  })
  page?: number;

  @Validator.IsOptional()
  @Validator.IsInt({
    message: 'Limit need to be an integer.'
  })
  @Validator.Min(1, {
    message: 'Limit can not be lower than 1.'
  })
  @Validator.Max(200, {
    message: 'Limit can not be higher than 200.'
  })
  limit?: number;
}
