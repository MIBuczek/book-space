import {ReferenceDataService} from './reference-data.service';
import {FACILITY_SEED} from './facility-seed';

/**
 * The bootstrap gate and the upsert shape. The document count and idempotency are proved
 * against a real database in `reference-data.integration.spec.ts`; this spec is about the
 * one branch a database cannot show — whether the hook runs at all.
 */
describe('ReferenceDataService', () => {
  const logger = {log: jest.fn(), warn: jest.fn(), error: jest.fn()};
  let bulkWrite: jest.Mock;

  const build = () => {
    bulkWrite = jest.fn().mockResolvedValue({upsertedCount: 12, modifiedCount: 0});
    const model = {bulkWrite};
    return new ReferenceDataService(model as never, logger as never);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SEED_REFERENCE_DATA;
  });

  afterAll(() => {
    delete process.env.SEED_REFERENCE_DATA;
  });

  it('does not seed on bootstrap when the flag is absent', async () => {
    await build().onApplicationBootstrap();

    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('does not seed when the flag is the string "false"', async () => {
    // The trap from AGENTS.md: `Boolean('false')` is `true`, so a flag parsed through the
    // global pipe's implicit conversion would be on whenever it was present. The service
    // compares against the exact string instead.
    process.env.SEED_REFERENCE_DATA = 'false';

    await build().onApplicationBootstrap();

    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('seeds on bootstrap only for the exact string "true"', async () => {
    process.env.SEED_REFERENCE_DATA = 'true';

    await build().onApplicationBootstrap();

    expect(bulkWrite).toHaveBeenCalledTimes(1);
  });

  it('upserts every facility on the {city, property} key', async () => {
    const service = build();

    const result = await service.seedFacilities();

    const [operations] = bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(FACILITY_SEED.length);
    for (const operation of operations) {
      expect(operation.updateOne.filter).toEqual({
        city: expect.any(String),
        property: expect.any(String),
      });
      expect(operation.updateOne.upsert).toBe(true);
      expect(operation.updateOne.update.$set).toBeDefined();
    }
    expect(result).toEqual({inserted: 12, updated: 0, total: FACILITY_SEED.length});
  });

  it('reports the total from the seed constant, not from the write result', async () => {
    bulkWrite = jest.fn().mockResolvedValue({upsertedCount: 0, modifiedCount: 0});
    const service = new ReferenceDataService({bulkWrite} as never, logger as never);

    const result = await service.seedFacilities();

    expect(result.total).toBe(FACILITY_SEED.length);
  });
});
