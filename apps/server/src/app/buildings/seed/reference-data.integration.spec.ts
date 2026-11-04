import {Model} from 'mongoose';
import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../../testing/mongo-test-context';
import {ReferenceDataService} from './reference-data.service';
import {FACILITY_SEED, CITY_SEED} from './facility-seed';
import {Building} from '../schemas/building.schema';

/**
 * Proves the reference seed over a real MongoDB (FR-007, research.md R6, T012).
 *
 * Idempotency is the property a unit test cannot show: it depends on the `{city, property}`
 * unique index, so a mocked `bulkWrite` would assert the call shape rather than the document
 * count. The same reason the building-identity spec uses a real database.
 */
describe('reference data seed', () => {
  let ctx: MongoTestContext;
  let seeder: ReferenceDataService;
  let buildingModel: Model<Building>;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    seeder = ctx.app.get(ReferenceDataService);
    buildingModel = ctx.app.get<Model<Building>>(getModelToken('Building'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    // `reset()` drops the database and its indexes; the upsert matches on the compound
    // unique index, so it has to be rebuilt before each test.
    await buildingModel.createIndexes();
  });

  const signIn = async (email: string): Promise<string> => {
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role: 'ADMIN',
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as {token: string}).token;
  };

  it('seeds twelve facilities across four cities', async () => {
    const result = await seeder.seedFacilities();

    expect(result.inserted).toBe(12);
    expect(await buildingModel.countDocuments()).toBe(12);
    expect([...(await buildingModel.distinct('city'))].sort()).toEqual([...CITY_SEED].sort());
  });

  it('is idempotent: a second run adds nothing', async () => {
    await seeder.seedFacilities();
    const second = await seeder.seedFacilities();

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(await buildingModel.countDocuments()).toBe(12);
  });

  it('reverts an edited facility to the seed value on the next run', async () => {
    await seeder.seedFacilities();
    await buildingModel.updateOne(
      {city: 'siechnice', property: 'orlik'},
      {$set: {name: 'Renamed by an admin'}},
    );

    await seeder.seedFacilities();

    const orlik = await buildingModel.findOne({city: 'siechnice', property: 'orlik'});
    expect(orlik?.name).toBe('Orlik');
  });

  it('completes a partially seeded database rather than skipping it', async () => {
    // An "is the collection empty?" guard would see one row and skip the whole seed,
    // leaving the other eleven missing. The upsert matches per key, so it fills the gap.
    await buildingModel.create({...FACILITY_SEED[0]});

    const result = await seeder.seedFacilities();

    expect(result.inserted).toBe(11);
    expect(await buildingModel.countDocuments()).toBe(12);
  });

  it('carries the lighting and toilets flags for the one facility that has them', async () => {
    await seeder.seedFacilities();

    const turf = await buildingModel.findOne({property: 'boisko-sztuczna-nawierzchnia'});
    expect(turf).toMatchObject({lighting: true, toilets: true});
    expect(await buildingModel.countDocuments({lighting: true})).toBe(1);
  });

  it('serves all twelve facilities from GET /api/buildings', async () => {
    await seeder.seedFacilities();
    const token = await signIn('admin@example.com');

    const response = await fetch(`${ctx.baseUrl}/buildings`, {
      headers: {authorization: `Bearer ${token}`},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(12);

    const siechniceHala = body.find(
      (b) => b.city === 'siechnice' && b.property === 'hala-sportowa',
    );
    expect(siechniceHala).toMatchObject({
      name: 'Hala sportowa',
      sizes: ['1/3', '2/3', '1/1'],
      lighting: false,
      toilets: false,
      phone: '609 996 064',
    });
  });
});
