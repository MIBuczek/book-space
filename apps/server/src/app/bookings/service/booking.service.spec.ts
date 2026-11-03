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
      await service.updateBooking('b1', {createdBy: 'attacker', comments: 'x'} as never);

      const [, updates] = modelMock.updateOne.mock.calls[0];
      expect(updates).not.toHaveProperty('createdBy');
      expect(updates).toMatchObject({comments: 'x'});
    });

    it('does not pass a caller-supplied accepted or archive to the driver', async () => {
      // These are the administrator decisions T020 moved behind the approve/archive
      // routes. Leaving them settable through the generic update would let a booking's
      // owner approve their own request and skip the conflict check.
      await service.updateBooking('b1', {accepted: true, archive: true, comments: 'x'} as never);

      const [, updates] = modelMock.updateOne.mock.calls[0];
      expect(updates).not.toHaveProperty('accepted');
      expect(updates).not.toHaveProperty('archive');
      expect(updates).toMatchObject({comments: 'x'});
    });
  });

  describe('setApproval', () => {
    const DAY = new Date('2026-03-04T00:00:00Z');
    const pending = (overrides: Record<string, unknown> = {}) => ({
      _id: 'target',
      place: {place: 'hala', city: 'siechnice'},
      month: 3,
      accepted: false,
      bookedTimes: [{day: DAY, startHours: new Date('2026-03-04T08:00:00Z'), endHours: new Date('2026-03-04T10:00:00Z')}],
      ...overrides,
    });

    beforeEach(() => {
      modelMock.findOne.mockReset();
      modelMock.find.mockReset();
      modelMock.findOneAndUpdate.mockReset();
      modelMock.findOne.mockResolvedValue(pending());
      modelMock.find.mockResolvedValue([pending()]);
      modelMock.findOneAndUpdate.mockResolvedValue(pending({accepted: true}));
    });

    it('refuses an approval that would keep a conflict, without writing', async () => {
      modelMock.find.mockResolvedValue([
        pending(),
        pending({_id: 'other', bookedTimes: [{day: DAY, startHours: new Date('2026-03-04T09:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z')}]}),
      ]);

      await expect(service.setApproval('target', true, false)).rejects.toMatchObject({status: 409});
      expect(modelMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('carries the conflicting ids on the 409 so the UI can name them', async () => {
      modelMock.find.mockResolvedValue([
        pending(),
        pending({_id: 'other', bookedTimes: [{day: DAY, startHours: new Date('2026-03-04T09:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z')}]}),
      ]);

      await expect(service.setApproval('target', true, false)).rejects.toMatchObject({
        body: {conflicts: ['other']},
      });
    });

    it('approves despite a conflict when force is set, and reports the conflicts', async () => {
      modelMock.find.mockResolvedValue([
        pending(),
        pending({_id: 'other', bookedTimes: [{day: DAY, startHours: new Date('2026-03-04T09:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z')}]}),
      ]);

      await expect(service.setApproval('target', true, true)).resolves.toMatchObject({conflicts: ['other']});
      expect(modelMock.findOneAndUpdate).toHaveBeenCalled();
    });

    it('approves an unconflicted booking', async () => {
      await expect(service.setApproval('target', true, false)).resolves.toMatchObject({conflicts: []});
      expect(modelMock.findOneAndUpdate).toHaveBeenCalled();
    });

    it('does not run the conflict check when unapproving', async () => {
      // Unapproving cannot introduce a double booking, and refusing to unapprove a
      // conflicted booking would trap it.
      modelMock.find.mockResolvedValue([
        pending(),
        pending({_id: 'other', bookedTimes: [{day: DAY, startHours: new Date('2026-03-04T09:00:00Z'), endHours: new Date('2026-03-04T11:00:00Z')}]}),
      ]);

      await service.setApproval('target', false, false);

      expect(modelMock.find).not.toHaveBeenCalled();
      expect(modelMock.findOneAndUpdate).toHaveBeenCalled();
    });

    it('records the actor and the timestamp with the write', async () => {
      await service.setApproval('target', true, false);

      const [, update] = modelMock.findOneAndUpdate.mock.calls[0];
      expect(update).toHaveProperty('modifiedAt');
      expect(update).toMatchObject({accepted: true});
    });

    it('answers 404 for a booking that does not exist', async () => {
      modelMock.findOne.mockResolvedValue(null);

      await expect(service.setApproval('missing', true, false)).rejects.toMatchObject({status: 404});
    });
  });

  describe('setArchive', () => {
    beforeEach(() => {
      modelMock.findOneAndUpdate.mockReset();
      modelMock.findOneAndUpdate.mockResolvedValue({_id: 'target', archive: true});
    });

    it('sets the archive flag', async () => {
      await service.setArchive('target', true);

      const [, update] = modelMock.findOneAndUpdate.mock.calls[0];
      expect(update).toMatchObject({archive: true});
    });

    it('records the actor and the timestamp with the write', async () => {
      await service.setArchive('target', true);

      const [, update] = modelMock.findOneAndUpdate.mock.calls[0];
      expect(update).toHaveProperty('modifiedAt');
    });

    it('answers 404 when the update matches nothing', async () => {
      modelMock.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.setArchive('missing', true)).rejects.toMatchObject({status: 404});
    });
  });
});
