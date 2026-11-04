import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the booking indexes exist and that the list query can use them (FR-043, issue #14).
 *
 * A declared index and an index that MongoDB built are different claims, and the list query
 * using it is a third: `data-model.md` names three indexes, and the acceptance criterion for
 * T010 is that they "exist and are used by the list query (verify with `explain`)". A unit
 * test on the schema object cannot show any of that — it would only restate the declaration.
 *
 * `reset()` drops the database, which drops the indexes with it, so `createIndexes()` runs
 * before each test. The `explain` is asserted on `IXSCAN` rather than on a named index,
 * because MongoDB is free to choose which of the two eligible indexes to use.
 */
describe('booking indexes over a real database', () => {
  let ctx: MongoTestContext;
  /**
   * The driver surface this spec drives, declared locally rather than as `Model<Booking>`.
   *
   * `Model<Booking>.create`/`.find` type-check against the hydrated document, and these calls
   * deliberately use the raw driver shapes: `create` takes a plain document literal, and
   * `explain` returns a query plan that the Mongoose overloads do not describe. Typing only
   * the methods used keeps the spec honest about what it touches without pretending the
   * document type fits.
   */
  let bookingModel: {
    create: (doc: Record<string, unknown>) => Promise<unknown>;
    createIndexes: () => Promise<unknown>;
    listIndexes: () => Promise<Array<Record<string, unknown>>>;
    find: (filter: Record<string, unknown>) => {explain: (verbosity: string) => Promise<unknown>};
  };

  const booking = (overrides: Record<string, unknown> = {}) => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala-sportowa', city: 'siechnice'},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [{day: new Date('2026-03-04T10:00:00Z'), startHours: new Date('2026-03-04T10:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z'), status: 'INITIAL'}],
    accepted: true,
    archive: false,
    paymentMethod: 'CASH',
    clientId: '507f1f77bcf86cd799439011',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await bookingModel.createIndexes();
  });

  const indexKeys = async (): Promise<string[]> => {
    const indexes = await bookingModel.listIndexes();
    return indexes.map((index) => JSON.stringify((index as {key: Record<string, unknown>}).key));
  };

  it('builds the facility-month index', async () => {
    expect(await indexKeys()).toContain(
      JSON.stringify({'place.city': 1, 'place.place': 1, month: 1, accepted: 1, archive: 1}),
    );
  });

  it('builds the client index', async () => {
    expect(await indexKeys()).toContain(JSON.stringify({clientId: 1, accepted: 1}));
  });

  it('builds the recency index', async () => {
    expect(await indexKeys()).toContain(JSON.stringify({createdAt: -1, _id: -1}));
  });

  it('uses an index for the facility-month list query rather than a collection scan', async () => {
    await bookingModel.create(booking());

    const explained = (await bookingModel
      .find({'place.city': 'siechnice', 'place.place': 'hala-sportowa', month: 3, accepted: true, archive: false})
      .explain('queryPlanner')) as {
      queryPlanner: {winningPlan: {stage: string; inputStage?: {stage: string}}};
    };

    // A `COLLSCAN` means the index exists but is not used for this shape of query — the
    // defect the acceptance criterion is about. The winning plan is the index scan, possibly
    // wrapped in a fetch.
    const stages = [explained.queryPlanner.winningPlan.stage, explained.queryPlanner.winningPlan.inputStage?.stage];
    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('COLLSCAN');
  });
});
