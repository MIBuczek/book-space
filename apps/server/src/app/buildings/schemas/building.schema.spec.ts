import mongoose, {Model} from 'mongoose';
import {Building, BuildingSchema} from './building.schema';

// The schema's validators and defaults are what is under test, so the real schema is used
// rather than a hand-built one. Cloning keeps the definitions while letting this spec turn
// command buffering off: without a database, validation still runs in memory, which is
// where the size and zip-code rules live.
const isolatedSchema = BuildingSchema.clone();
isolatedSchema.set('bufferCommands', false);

let BuildingModel: Model<Building>;

beforeAll(() => {
  BuildingModel = mongoose.model<Building>('BuildingSchemaSpec', isolatedSchema);
});

afterAll(() => {
  mongoose.deleteModel('BuildingSchemaSpec');
});

const facility = (overrides: Record<string, unknown> = {}) => ({
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/1'],
  email: 'siechnice.hala@gmail.com',
  phone: '609996064',
  street: 'ul. Sportowa 1',
  zipCode: '55-010',
  ...overrides,
});

const errorsFor = (overrides: Record<string, unknown>) => {
  const doc = new BuildingModel(facility(overrides));
  return doc.validateSync()?.errors ?? {};
};

describe('BuildingSchema validation', () => {
  it('accepts a complete facility', () => {
    expect(errorsFor({})).toEqual({});
  });

  it('defaults lighting, toilets and employees when they are omitted', () => {
    const doc = new BuildingModel(facility({}));

    expect(doc.lighting).toBe(false);
    expect(doc.toilets).toBe(false);
    expect(doc.employees).toEqual([]);
  });

  it('rejects an empty size list', () => {
    expect(errorsFor({sizes: []})).toHaveProperty('sizes');
  });

  it('rejects a size outside the six fractions', () => {
    expect(errorsFor({sizes: ['1/1', '2/5']})).toHaveProperty('sizes');
  });

  it('rejects a city outside the four the business operates in', () => {
    expect(errorsFor({city: 'wroclaw'})).toHaveProperty('city');
  });

  it('rejects a zip code with a character the pattern does not allow', () => {
    expect(errorsFor({zipCode: '55-01A'})).toHaveProperty('zipCode');
  });

  it('rejects a malformed contact e-mail', () => {
    expect(errorsFor({email: 'not-an-email'})).toHaveProperty('email');
  });

  it('requires a property key', () => {
    expect(errorsFor({property: undefined})).toHaveProperty('property');
  });
});
