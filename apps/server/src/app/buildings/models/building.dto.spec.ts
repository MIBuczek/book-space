import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {BuildingDto, UpdateBuildingDto} from './building.dto';

/**
 * Runs the same validation the global `ValidationPipe` applies, so a payload that
 * passes here passes over HTTP. `whitelist`/`forbidNonWhitelisted` match `configureApp`,
 * which is what rejects a body carrying a field the DTO does not declare.
 */
const validateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(BuildingDto, payload), {whitelist: true, forbidNonWhitelisted: true});

const validateUpdateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateBuildingDto, payload), {whitelist: true, forbidNonWhitelisted: true});

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1', '1/2'],
  email: 'siechnice.hala@gmail.com',
  phone: '609996064',
  street: 'ul. Sportowa 1',
  zipCode: '55-010',
  ...overrides,
});

const fieldNames = (errors: {property: string}[]) => errors.map((e) => e.property);

describe('BuildingDto', () => {
  it('accepts a complete payload', async () => {
    await expect(validateDto(validPayload())).resolves.toHaveLength(0);
  });

  it('accepts the lighting, toilets and employees the contract declares', async () => {
    await expect(
      validateDto(validPayload({lighting: true, toilets: true, employees: ['Bożena Kaczyńska']})),
    ).resolves.toHaveLength(0);
  });

  it('accepts a payload without street and zipCode', async () => {
    // No legacy facility carries an address (spec.md §4, FR-009), so the seed supplies
    // neither and both must be optional — a required field would force invented data.
    const payload = validPayload();
    delete (payload as Record<string, unknown>).street;
    delete (payload as Record<string, unknown>).zipCode;

    await expect(validateDto(payload)).resolves.toHaveLength(0);
  });

  it('still validates a zipCode when one is supplied', async () => {
    const errors = await validateDto(validPayload({zipCode: '55-0'}));

    expect(fieldNames(errors)).toContain('zipCode');
  });

  it('requires a property key', async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).property;

    const errors = await validateDto(payload);

    expect(fieldNames(errors)).toContain('property');
  });

  it('rejects an empty property key', async () => {
    const errors = await validateDto(validPayload({property: ''}));

    expect(fieldNames(errors)).toContain('property');
  });

  it('rejects a city outside the four the business operates in', async () => {
    const errors = await validateDto(validPayload({city: 'wroclaw'}));

    expect(fieldNames(errors)).toContain('city');
  });

  it('requires at least one rentable size', async () => {
    const errors = await validateDto(validPayload({sizes: []}));

    expect(fieldNames(errors)).toContain('sizes');
  });

  it('rejects a size outside the six fractions a hall can be split into', async () => {
    const errors = await validateDto(validPayload({sizes: ['1/1', '2/5']}));

    expect(fieldNames(errors)).toContain('sizes');
  });

  it('rejects a field the contract does not declare', async () => {
    const errors = await validateDto(validPayload({mystery: 'nope'}));

    expect(fieldNames(errors)).toContain('mystery');
  });
});

describe('UpdateBuildingDto', () => {
  it('accepts an empty payload because every field is optional', async () => {
    await expect(validateUpdateDto({})).resolves.toHaveLength(0);
  });

  it('still validates a supplied size list', async () => {
    const errors = await validateUpdateDto({sizes: ['9/9']});

    expect(fieldNames(errors)).toContain('sizes');
  });

  it('rejects an empty size list, which would leave the facility unbookable', async () => {
    const errors = await validateUpdateDto({sizes: []});

    expect(fieldNames(errors)).toContain('sizes');
  });

  it('accepts an active flag, which the deactivation route sends (T059)', async () => {
    await expect(validateUpdateDto({active: false})).resolves.toHaveLength(0);
  });

  it('rejects a non-boolean active value', async () => {
    const errors = await validateUpdateDto({active: 'no'});

    expect(fieldNames(errors)).toContain('active');
  });
});
