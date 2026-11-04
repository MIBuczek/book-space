import {getModelToken} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';
import {ReferenceDataService} from '../buildings/seed/reference-data.service';
import {Building} from '../buildings/schemas/building.schema';
import {FACILITY_SEED} from '../buildings/seed/facility-seed';
import {SIZES} from '@models/building.model';

/**
 * Proves the booking-size rule is attached to the routes a client reaches (FR-031, T052).
 *
 * The unit spec drives `isSizeOffered` and the service in isolation. What only an end-to-end
 * request shows is that the rule reads the *stored* facility for the pair the booking names:
 * a seeded facility's allowed set is what decides, on both the create and the update route.
 *
 * Every seeded facility is exercised rather than a single representative one, because the
 * rule is per-facility — `sala-fitness` rents only `1/1` while `boisko-sztuczna-nawierzchnia`
 * rents four sizes, and a rule that only happened to work for one of them would pass a
 * single-facility test.
 */
describe('booking size rule over HTTP', () => {
  let ctx: MongoTestContext;
  let buildingModel: Model<Building>;
  let userModel: {create: (doc: Record<string, unknown>) => Promise<{_id: unknown}>};
  let token: string;

  const PASSWORD = 'correct horse battery';

  /** A create body that is valid apart from the facility and size under test. */
  const createBody = (property: string, city: string, size: string) => ({
    type: 'INDIVIDUAL',
    place: {place: property, city},
    size,
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: '2026-03-04T00:00:00.000Z',
        startHours: '2026-03-04T08:00:00.000Z',
        endHours: '2026-03-04T10:00:00.000Z',
        status: 'INITIAL',
      },
    ],
    paymentMethod: 'CASH',
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    buildingModel = ctx.app.get<Model<Building>>(getModelToken('Building'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await buildingModel.createIndexes();
    const seeder = ctx.app.get(ReferenceDataService);
    await seeder.seedFacilities();

    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'admin@example.com',
      password: PASSWORD,
      role: 'ADMIN',
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email: 'admin@example.com', password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    token = ((await response.json()) as {token: string}).token;
  });

  const post = (body: unknown) =>
    fetch(`${ctx.baseUrl}/bookings`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  const put = (id: string, body: unknown) =>
    fetch(`${ctx.baseUrl}/bookings/${id}`, {
      method: 'PUT',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    });

  /** A size in the vocabulary that this facility does not offer. */
  const disallowedSize = (facility: {sizes: readonly string[]}) =>
    SIZES.find((size) => !facility.sizes.includes(size)) as string;

  describe('POST /bookings', () => {
    it('accepts every size each seeded facility offers', async () => {
      const results: Array<{facility: string; size: string; status: number}> = [];
      for (const facility of FACILITY_SEED) {
        for (const size of facility.sizes) {
          const response = await post(createBody(facility.property, facility.city, size));
          results.push({facility: facility.property, size, status: response.status});
        }
      }

      expect(results).toEqual(
        FACILITY_SEED.flatMap((facility) =>
          facility.sizes.map((size) => ({facility: facility.property, size, status: 201}))
        )
      );
    });

    it('rejects, for every seeded facility, a size it does not offer with 422', async () => {
      const results: Array<{facility: string; size: string; status: number}> = [];
      for (const facility of FACILITY_SEED) {
        const size = disallowedSize(facility);
        const response = await post(createBody(facility.property, facility.city, size));
        results.push({facility: facility.property, size, status: response.status});
      }

      expect(results).toEqual(
        FACILITY_SEED.map((facility) => ({
          facility: facility.property,
          size: disallowedSize(facility),
          status: 422,
        }))
      );
    });

    it('names the size field in the rejection', async () => {
      const facility = FACILITY_SEED.find((f) => f.property === 'sala-fitness') as {property: string; city: string};

      const response = await post(createBody(facility.property, facility.city, '3/4'));

      expect(response.status).toBe(422);
      const body = (await response.json()) as {message: string};
      expect(body.message).toMatch(/size/i);
    });

    it('does not store the booking when the size is refused', async () => {
      const facility = FACILITY_SEED.find((f) => f.property === 'sala-fitness') as {property: string; city: string};

      await post(createBody(facility.property, facility.city, '3/4'));

      const bookingModel = ctx.app.get(getModelToken('Booking')) as Model<unknown>;
      expect(await bookingModel.countDocuments()).toBe(0);
    });
  });

  describe('PUT /bookings/{_id}', () => {
    it('rejects changing a booking to a size its facility does not offer with 422', async () => {
      // `hala-sportowa` rents `1/3`, `2/3` and `1/1`; `1/2` is a valid size elsewhere but
      // not here, so the rule has to be applied to the stored facility rather than to the
      // shape of the value.
      const created = await post(createBody('hala-sportowa', 'siechnice', '1/3'));
      expect(created.status).toBe(201);
      const {_id} = (await created.json()) as {_id: string};

      const response = await put(_id, {size: '1/2'});

      expect(response.status).toBe(422);
    });

    it('accepts changing a booking to a size its facility offers', async () => {
      const created = await post(createBody('hala-sportowa', 'siechnice', '1/3'));
      expect(created.status).toBe(201);
      const {_id} = (await created.json()) as {_id: string};

      const response = await put(_id, {size: '1/1'});

      expect(response.status).toBe(200);
    });
  });
});
