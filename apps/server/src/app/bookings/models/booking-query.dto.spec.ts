import {ValidationPipe} from '@nestjs/common';
import {BookingQueryDto} from './booking-query.dto';
import {VALIDATION_PIPE_OPTIONS} from '../../config/validation-options';

/**
 * The query DTO is validated by the same pipe the application registers, so this spec
 * runs the real `ValidationPipe` rather than calling `plainToInstance` by hand. The
 * distinction matters: the boolean defect below only appears once
 * `enableImplicitConversion` is on, and a hand-built transform would not reproduce it.
 */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

const transform = (query: Record<string, unknown>): Promise<BookingQueryDto> =>
  pipe.transform(query, {type: 'query', metatype: BookingQueryDto}) as Promise<BookingQueryDto>;

describe('BookingQueryDto', () => {
  describe('boolean flags', () => {
    // `enableImplicitConversion` coerces a query string with `Boolean(value)`, and
    // `Boolean('false')` is `true`. Without `@BooleanQuery` reading the raw value,
    // `?archive=false` would ask for the archived records — a filter that inverts.
    it('reads ?archive=false as false, not as the truthy string', async () => {
      const dto = await transform({archive: 'false'});

      expect(dto.archive).toBe(false);
    });

    it('reads ?archive=true as true', async () => {
      const dto = await transform({archive: 'true'});

      expect(dto.archive).toBe(true);
    });

    it('applies the same rule to accepted and all', async () => {
      await expect(transform({accepted: 'false'})).resolves.toMatchObject({accepted: false});
      await expect(transform({all: 'false'})).resolves.toMatchObject({all: false});
    });

    it('leaves an absent flag undefined rather than defaulting it to false', async () => {
      // `archive` defaults to false in the resolver, not here: the DTO must be able to
      // tell "not asked for" from "asked for false".
      const dto = await transform({});

      expect(dto.archive).toBeUndefined();
      expect(dto.accepted).toBeUndefined();
    });

    it('leaves an explicitly undefined flag undefined', async () => {
      // A query object that omits the key does not run the transform at all
      // (class-transformer skips an absent key), so this is the only case that executes
      // the `raw === undefined` arm of `BooleanQuery`.
      const dto = await transform({archive: undefined});

      expect(dto.archive).toBeUndefined();
    });

    it('accepts a boolean that is already a boolean', async () => {
      // Nest parses some query formats into real booleans before the pipe sees them, so
      // the transform must pass a boolean through unchanged as well as parse a string.
      await expect(transform({archive: true})).resolves.toMatchObject({archive: true});
      await expect(transform({archive: false})).resolves.toMatchObject({archive: false});
    });
  });

  describe('dates', () => {
    it('converts an ISO bound to a Date', async () => {
      const dto = await transform({from: '2026-08-01T00:00:00.000Z'});

      expect(dto.from).toBeInstanceOf(Date);
      expect(dto.from?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('rejects an unparsable bound', async () => {
      await expect(transform({from: 'not-a-date'})).rejects.toThrow();
    });
  });

  describe('pagination', () => {
    it('converts page and limit to numbers', async () => {
      await expect(transform({page: '2', limit: '10'})).resolves.toMatchObject({page: 2, limit: 10});
    });

    it('rejects a limit above the maximum', async () => {
      await expect(transform({limit: '500'})).rejects.toThrow();
    });

    it('rejects a page below 1', async () => {
      await expect(transform({page: '0'})).rejects.toThrow();
    });
  });

  describe('tenant-name search', () => {
    it('accepts a search term and passes it through', async () => {
      await expect(transform({search: 'Kowalski'})).resolves.toMatchObject({search: 'Kowalski'});
    });

    it('rejects a search longer than the tenant-name bound', async () => {
      await expect(transform({search: 'x'.repeat(126)})).rejects.toThrow();
    });

    it('rejects a non-string search', async () => {
      await expect(transform({search: ['a', 'b']})).rejects.toThrow();
    });
  });

  describe('unknown fields', () => {
    it('rejects a field the DTO does not declare', async () => {
      await expect(transform({nonsense: 'x'})).rejects.toThrow();
    });
  });
});
