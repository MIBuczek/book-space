import {ValidationPipe} from '@nestjs/common';
import {ClientQueryDto} from './client-query.dto';
import {VALIDATION_PIPE_OPTIONS} from '../../config/validation-options';

/**
 * The query DTO is validated by the same pipe the application registers, so this spec runs
 * the real `ValidationPipe` rather than calling `plainToInstance` by hand: the coercion of
 * `page`/`limit` from query strings only happens once `enableImplicitConversion` is on.
 */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

const transform = (query: Record<string, unknown>): Promise<ClientQueryDto> =>
  pipe.transform(query, {type: 'query', metatype: ClientQueryDto}) as Promise<ClientQueryDto>;

describe('ClientQueryDto', () => {
  it('accepts an empty query', async () => {
    const dto = await transform({});

    expect(dto.search).toBeUndefined();
    expect(dto.page).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it('accepts a search term and passes it through', async () => {
    await expect(transform({search: 'Kowalski'})).resolves.toMatchObject({search: 'Kowalski'});
  });

  it('rejects a search longer than the bound', async () => {
    await expect(transform({search: 'x'.repeat(126)})).rejects.toThrow();
  });

  it('rejects a non-string search', async () => {
    await expect(transform({search: ['a', 'b']})).rejects.toThrow();
  });

  it('converts page and limit to numbers', async () => {
    await expect(transform({page: '2', limit: '10'})).resolves.toMatchObject({page: 2, limit: 10});
  });

  it('rejects a page below 1', async () => {
    await expect(transform({page: '0'})).rejects.toThrow();
  });

  it('rejects a limit above the maximum', async () => {
    await expect(transform({limit: '500'})).rejects.toThrow();
  });

  it('rejects a field the DTO does not declare', async () => {
    await expect(transform({nonsense: 'x'})).rejects.toThrow();
  });
});
