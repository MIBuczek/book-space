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

  describe('findConflictingBookingIds', () => {
    const slot = (start: string, end: string) => ({
      day: new Date('2026-03-04T00:00:00Z'),
      startHours: new Date(start),
      endHours: new Date(end),
    });

    beforeEach(() => {
      modelMock.find.mockReset();
      modelMock.find.mockResolvedValue([]);
    });

    it('scopes the query to the facility and month', async () => {
      await service.findConflictingBookingIds('siechnice', 'hala', 3);

      expect(modelMock.find).toHaveBeenCalledWith({
        'place.city': 'siechnice',
        'place.place': 'hala',
        month: 3,
      });
    });

    it('returns the ids of the conflicting unaccepted bookings', async () => {
      modelMock.find.mockResolvedValue([
        {_id: 'a', month: 3, accepted: false, bookedTimes: [slot('2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]},
        {_id: 'b', month: 3, accepted: false, bookedTimes: [slot('2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]},
      ]);

      await expect(service.findConflictingBookingIds('siechnice', 'hala', 3)).resolves.toEqual(['a', 'b']);
    });

    it('excludes an accepted booking from the reported ids', async () => {
      modelMock.find.mockResolvedValue([
        {_id: 'accepted', month: 3, accepted: true, bookedTimes: [slot('2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]},
        {_id: 'pending', month: 3, accepted: false, bookedTimes: [slot('2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]},
      ]);

      await expect(service.findConflictingBookingIds('siechnice', 'hala', 3)).resolves.toEqual(['pending']);
    });

    it('maps a driver failure to an HTTP error', async () => {
      modelMock.find.mockRejectedValue(new Error('connection lost'));

      await expect(service.findConflictingBookingIds('siechnice', 'hala', 3)).rejects.toMatchObject({message: 'connection lost'});
    });
  });

  describe('updateBooking', () => {
    beforeEach(() => {
      modelMock.updateOne.mockReset();
      modelMock.updateOne.mockResolvedValue({matchedCount: 1});
    });

    it('does not pass a caller-supplied createdBy to the driver', async () => {
      // The update route takes `Partial<BookingDto>`, a mapped type erased at runtime,
      // so the global pipe whitelists nothing on it. A caller could otherwise reassign
      // ownership of a booking to themselves.
      await service.updateBooking('b1', {createdBy: 'attacker', accepted: true} as never);

      const [, updates] = modelMock.updateOne.mock.calls[0];
      expect(updates).not.toHaveProperty('createdBy');
      expect(updates).toMatchObject({accepted: true});
    });
  });
});
