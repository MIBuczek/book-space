import {Test, TestingModule} from '@nestjs/testing';
import {StructuredLogger} from '../../logging/structured-logger';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {BookingService} from './booking.service';

describe('BookingService', () => {
  let service: BookingService;

  // The service depends on a Mongoose model. The generated spec provided neither the
  // model token nor a JwtService, so Nest could not resolve the provider and every
  // assertion failed. Stub both so the unit under test can be constructed.
  const modelMock = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        {provide: getModelToken('Booking'), useValue: modelMock},
        {provide: StructuredLogger, useValue: {log: jest.fn(), warn: jest.fn(), error: jest.fn()}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllBooking', () => {
    beforeEach(() => {
      modelMock.find.mockReset();
      modelMock.find.mockResolvedValue([]);
    });

    it('restricts the public query to accepted, non-archived bookings', async () => {
      await service.findAllBooking(false);

      expect(modelMock.find).toHaveBeenCalledWith({accepted: true, archive: false});
    });

    it('does not restrict the staff query', async () => {
      await service.findAllBooking(true);

      expect(modelMock.find).toHaveBeenCalledWith({});
    });

    it('applies the restriction in the query, not after it', async () => {
      // The filter has to reach the database. Filtering the returned array would
      // read an unaccepted booking — the personal data on it — before discarding it.
      await service.findAllBooking(false);

      const [filter] = modelMock.find.mock.calls[0];
      expect(filter).not.toEqual({});
      expect(Object.keys(filter).sort()).toEqual(['accepted', 'archive']);
    });

    it('maps a driver failure to an HTTP error', async () => {
      modelMock.find.mockRejectedValue(new Error('connection lost'));

      await expect(service.findAllBooking(false)).rejects.toMatchObject({message: 'connection lost'});
    });
  });
});
