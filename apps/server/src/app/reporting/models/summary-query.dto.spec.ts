import {ValidationPipe} from '@nestjs/common';
import {SummaryQueryDto} from './summary-query.dto';
import {VALIDATION_PIPE_OPTIONS} from '../../config/validation-options';

/**
 * The query DTO is validated by the same pipe the application registers, so this spec runs the
 * real `ValidationPipe` rather than calling `plainToInstance` by hand. The `fromTheBeginning`
 * flag only misbehaves once `enableImplicitConversion` is on, and a hand-built transform would
 * not reproduce it.
 */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

const transform = (query: Record<string, unknown>): Promise<SummaryQueryDto> =>
  pipe.transform(query, {type: 'query', metatype: SummaryQueryDto}) as Promise<SummaryQueryDto>;

describe('SummaryQueryDto', () => {
  it('converts the month bounds to Dates', async () => {
    const dto = await transform({fromMonth: '2026-03-01', toMonth: '2026-03-31'});
    expect(dto.fromMonth).toBeInstanceOf(Date);
    expect(dto.toMonth).toBeInstanceOf(Date);
  });

  it('rejects a malformed month', async () => {
    await expect(transform({fromMonth: 'nonsense', toMonth: '2026-03-31'})).rejects.toThrow();
  });

  // `enableImplicitConversion` coerces a query string with `Boolean(value)` and
  // `Boolean('false')` is `true`, so without `@BooleanQuery` reading the raw value
  // `?fromTheBeginning=false` would ask for the whole history.
  it('reads ?fromTheBeginning=false as false, not as the truthy string', async () => {
    await expect(transform({fromTheBeginning: 'false'})).resolves.toMatchObject({fromTheBeginning: false});
  });

  it('reads ?fromTheBeginning=true as true', async () => {
    await expect(transform({fromTheBeginning: 'true'})).resolves.toMatchObject({fromTheBeginning: true});
  });

  it('leaves an absent flag undefined', async () => {
    await expect(transform({})).resolves.toMatchObject({fromTheBeginning: undefined});
  });

  it('leaves an explicitly undefined flag undefined', async () => {
    await expect(transform({fromTheBeginning: undefined})).resolves.toMatchObject({fromTheBeginning: undefined});
  });

  it('accepts a boolean that is already a boolean', async () => {
    await expect(transform({fromTheBeginning: true})).resolves.toMatchObject({fromTheBeginning: true});
    await expect(transform({fromTheBeginning: false})).resolves.toMatchObject({fromTheBeginning: false});
  });

  it('accepts a client id as a string', async () => {
    await expect(transform({clientId: 'c1'})).resolves.toMatchObject({clientId: 'c1'});
  });
});
