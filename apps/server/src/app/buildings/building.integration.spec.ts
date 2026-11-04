import {getModelToken} from '@nestjs/mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the facility identity rules over real HTTP and a real MongoDB (FR-007, FR-008,
 * FR-009, issue #13).
 *
 * The two acceptance criteria that only a real database can show are the compound index
 * — "two `hala-sportowa` in different cities coexist" and "a duplicate `{city, property}`
 * is rejected" — because a mocked `create` never consults an index. The third is that
 * `GET /api/buildings` returns the sizes and the lighting/toilets flags rather than the
 * legacy fields.
 */
describe('facility identity over HTTP', () => {
  let ctx: MongoTestContext;
  let buildingModel: {
    create: (doc: Record<string, unknown>) => Promise<unknown>;
    createIndexes: () => Promise<unknown>;
  };
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';

  const facility = (overrides: Record<string, unknown> = {}) => ({
    name: 'Hala sportowa',
    property: 'hala-sportowa',
    city: 'siechnice',
    sizes: ['1/1', '1/2'],
    email: 'siechnice.hala@gmail.com',
    phone: '609996064',
    street: 'ul. Sportowa 1',
    zipCode: '55-010',
    lighting: false,
    toilets: false,
    employees: ['Bożena Kaczyńska'],
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    buildingModel = ctx.app.get(getModelToken('Building'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    // `reset()` drops the database, and dropping it drops the indexes too. Rebuilding them
    // per test is what makes the duplicate-key assertions about the index rather than about
    // whether `autoIndex` happened to finish first — after the first drop it never rebuilds.
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

  it('allows the same property key in two different cities', async () => {
    await buildingModel.create(facility({city: 'siechnice'}));

    await expect(buildingModel.create(facility({city: 'radwanice'}))).resolves.toBeDefined();
  });

  it('rejects a duplicate city and property pair', async () => {
    await buildingModel.create(facility({city: 'siechnice'}));

    // The driver's duplicate-key error. Asserted on the code rather than the message so
    // the check is about the index, not about MongoDB's wording.
    await expect(buildingModel.create(facility({city: 'siechnice'}))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('rejects a facility with no rentable size', async () => {
    await expect(buildingModel.create(facility({sizes: []}))).rejects.toThrow();
  });

  it('rejects a size outside the six fractions', async () => {
    await expect(buildingModel.create(facility({sizes: ['2/5']}))).rejects.toThrow();
  });

  it('serves sizes and the lighting/toilets flags from GET /api/buildings', async () => {
    await buildingModel.create(
      facility({property: 'boisko-sztuczna-nawierzchnia', sizes: ['1/1', '1/2', '1/4', '3/4'], lighting: true, toilets: true}),
    );
    const token = await signIn('admin@example.com');

    const response = await fetch(`${ctx.baseUrl}/buildings`, {
      headers: {authorization: `Bearer ${token}`},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      property: 'boisko-sztuczna-nawierzchnia',
      sizes: ['1/1', '1/2', '1/4', '3/4'],
      lighting: true,
      toilets: true,
    });
  });
});
