import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {AuthGuard} from '@nestjs/passport';
import {BookingController} from './controller/booking.controller';
import {BookingService} from './service/booking.service';

/**
 * Regression test for the error-handling defect described in #107.
 *
 * The old idiom was `throw new HttpException(e.message, e.status)`. `e` is a
 * Mongoose error, which has no `status`, so the status was `undefined` and Nest
 * answered **200 OK**. A failed read was indistinguishable from an empty result.
 *
 * The guard is overridden so the request actually reaches the service; without
 * that the guard's own 500 would make this pass for the wrong reason. The
 * `find` call assertion below pins that the service was reached.
 */
describe('BookingService error mapping (regression)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const modelMock = {
    find: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        BookingService,
        {provide: getModelToken('Booking'), useValue: modelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('returns 500, not 200, when the database rejects', async () => {
    modelMock.find.mockRejectedValue(new Error('E11000 duplicate key error collection: bookings'));

    const res = await fetch(`${baseUrl}/bookings`);

    // Proves the request reached the service, not just the guard.
    expect(modelMock.find).toHaveBeenCalled();
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(200);
  });

  it('still reports success normally', async () => {
    modelMock.find.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/bookings`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // Known gap, deferred to the global exception filter in T002. Documented here
  // so the current behaviour is explicit rather than assumed to be safe.
  it('currently still returns the raw driver message to the caller', async () => {
    modelMock.find.mockRejectedValue(new Error('E11000 duplicate key error collection: bookings'));

    const body = await (await fetch(`${baseUrl}/bookings`)).text();

    expect(body).toContain('E11000');
  });
});
