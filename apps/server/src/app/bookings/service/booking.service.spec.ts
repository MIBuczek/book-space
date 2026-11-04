import {Test, TestingModule} from '@nestjs/testing';
import {StructuredLogger} from '../../logging/structured-logger';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {BookingService} from './booking.service';
import * as bookingList from '../list/booking-list';

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
    deleteMany: jest.fn(),
    countDocuments: jest.fn()
  };

  // The size rule (T052) reads the facility on write. A stub that resolves no facility
  // leaves the rule inert, which is what every case here except the size cases wants.
  const buildingModelMock = {findOne: jest.fn()};

  beforeEach(async () => {
    buildingModelMock.findOne.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        {provide: getModelToken('Booking'), useValue: modelMock},
        {provide: getModelToken('Building'), useValue: buildingModelMock},
        {provide: StructuredLogger, useValue: {log: jest.fn(), warn: jest.fn(), error: jest.fn()}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBooking', () => {
    beforeEach(() => {
      modelMock.create.mockReset();
      modelMock.create.mockResolvedValue({_id: 'b1'});
    });

    it('stamps the creator from the caller, not the body', async () => {
      await service.createBooking({nick: 'Rezerwacja'} as never, 'u2');

      expect(modelMock.create).toHaveBeenCalledWith(expect.objectContaining({createdBy: 'u2'}));
    });

    it('derives extraOptions from selectedOptions', async () => {
      // The flag is stored rather than virtual (data-model.md), so it has to be computed
      // somewhere; computing it from the same body the add-ons come from is what keeps the
      // two from disagreeing.
      await service.createBooking(
        {selectedOptions: [{options: [{lights: true}], fromHour: new Date(), toHour: new Date()}]} as never,
        'u2'
      );

      expect(modelMock.create).toHaveBeenCalledWith(expect.objectContaining({extraOptions: true}));
    });

    it('defaults extraOptions to false when there are no add-ons', async () => {
      await service.createBooking({selectedOptions: []} as never, 'u2');

      expect(modelMock.create).toHaveBeenCalledWith(expect.objectContaining({extraOptions: false}));
    });

    it('refuses a size the referenced facility does not offer with 422', async () => {
      buildingModelMock.findOne.mockResolvedValue({sizes: ['1/1']});

      await expect(
        service.createBooking(
          {size: '3/4', place: {place: 'sala-fitness', city: 'siechnice'}} as never,
          'u2'
        )
      ).rejects.toMatchObject({status: 422});
      expect(modelMock.create).not.toHaveBeenCalled();
    });

    it('accepts a size the facility offers', async () => {
      buildingModelMock.findOne.mockResolvedValue({sizes: ['1/1', '1/2']});

      await service.createBooking(
        {size: '1/2', place: {place: 'hala-sportowa', city: 'siechnice'}} as never,
        'u2'
      );

      expect(modelMock.create).toHaveBeenCalled();
    });

    it('leaves a booking whose facility does not resolve to the integrity task', async () => {
      // The facility question is T059's; a placeholder facility name must not be reported
      // as a size error.
      buildingModelMock.findOne.mockResolvedValue(null);

      await service.createBooking({size: '3/4', place: {place: 'unknown', city: 'siechnice'}} as never, 'u2');

      expect(modelMock.create).toHaveBeenCalled();
    });

    it('maps a driver error onto an HTTP exception', async () => {
      modelMock.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.createBooking({} as never, 'u2')).rejects.toMatchObject({status: 500});
    });
  });

  describe('findAllBooking', () => {
    const FROM = new Date('2026-08-01T00:00:00+02:00');
    const TO = new Date('2026-09-30T23:59:59+02:00');

    beforeEach(() => {
      modelMock.find.mockReset();
      modelMock.countDocuments.mockReset();
      modelMock.find.mockResolvedValue([]);
      modelMock.countDocuments.mockResolvedValue(0);
    });

    it('restricts the public query to accepted, non-archived bookings', async () => {
      await service.findAllBooking({from: FROM, to: TO}, false);

      const [criteria] = modelMock.find.mock.calls[0];
      expect(criteria).toMatchObject({accepted: true, archive: false});
    });

    it('applies the restriction in the query, not after it', async () => {
      // The filter has to reach the database. Filtering the returned array would
      // read an unaccepted booking — the personal data on it — before discarding it.
      await service.findAllBooking({from: FROM, to: TO}, false);

      const [criteria] = modelMock.find.mock.calls[0];
      expect(Object.keys(criteria).sort()).toEqual(['accepted', 'archive', 'createdAt']);
    });

    it('refuses a public request without a period', async () => {
      await expect(service.findAllBooking({}, false)).rejects.toMatchObject({status: 422});
      expect(modelMock.find).not.toHaveBeenCalled();
    });

    it('does not restrict the staff query', async () => {
      await service.findAllBooking({from: FROM, to: TO}, true);

      const [criteria] = modelMock.find.mock.calls[0];
      expect(criteria).not.toHaveProperty('accepted');
      expect(criteria.archive).toBe(false);
    });

    it('ranges the period over createdAt, inclusive on both ends', async () => {
      await service.findAllBooking({from: FROM, to: TO}, true);

      const [criteria] = modelMock.find.mock.calls[0];
      expect(criteria.createdAt).toEqual({$gte: FROM, $lte: TO});
    });

    it('counts with the same filter it reads with', async () => {
      await service.findAllBooking({from: FROM, to: TO}, true);

      expect(modelMock.countDocuments).toHaveBeenCalledWith(modelMock.find.mock.calls[0][0]);
    });

    it('returns the contract envelope with the pre-pagination total', async () => {
      modelMock.find.mockResolvedValue([{_id: 'b1'}]);
      modelMock.countDocuments.mockResolvedValue(37);

      const page = await service.findAllBooking({page: 3, limit: 10}, true);

      expect(page).toEqual({items: [{_id: 'b1'}], total: 37, page: 3, limit: 10});
    });

    it('applies the sort, offset and page size to the read', async () => {
      await service.findAllBooking({page: 3, limit: 10}, true);

      const [, , options] = modelMock.find.mock.calls[0];
      expect(options).toMatchObject({skip: 20, limit: 10, lean: true, sort: {createdAt: -1, _id: -1}});
    });

    it('defaults a staff request with no period to the academic year containing now', async () => {
      // `now` is not injectable through the service, so this asserts the shape rather
      // than an exact instant: a bounded createdAt range on both ends.
      await service.findAllBooking({}, true);

      const [criteria] = modelMock.find.mock.calls[0];
      expect(criteria.createdAt).toHaveProperty('$gte');
      expect(criteria.createdAt).toHaveProperty('$lte');
    });

    it('maps a driver failure on the read to an HTTP error', async () => {
      modelMock.find.mockRejectedValue(new Error('connection lost'));

      await expect(service.findAllBooking({from: FROM, to: TO}, false)).rejects.toMatchObject({message: 'connection lost'});
    });

    it('maps a driver failure on the count to an HTTP error', async () => {
      modelMock.countDocuments.mockRejectedValue(new Error('connection lost'));

      await expect(service.findAllBooking({from: FROM, to: TO}, false)).rejects.toMatchObject({message: 'connection lost'});
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

    it('refuses an update that sets a size the stored facility does not offer', async () => {
      modelMock.findOne.mockResolvedValue({size: '1/1', place: {place: 'sala-fitness', city: 'siechnice'}});
      buildingModelMock.findOne.mockResolvedValue({sizes: ['1/1']});

      await expect(service.updateBooking('b1', {size: '3/4'} as never)).rejects.toMatchObject({status: 422});
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('checks the size against the new facility when only the place changes', async () => {
      // The stored size is fine for the stored facility but not for the new one, so the
      // rule has to be applied to the effective pair rather than to the body alone.
      modelMock.findOne.mockResolvedValue({size: '3/4', place: {place: 'boisko-sztuczna-nawierzchnia', city: 'siechnice'}});
      buildingModelMock.findOne.mockResolvedValue({sizes: ['1/1']});

      await expect(
        service.updateBooking('b1', {place: {place: 'sala-fitness', city: 'siechnice'}} as never)
      ).rejects.toMatchObject({status: 422});
    });

    it('does not run the size rule when the booking does not exist', async () => {
      // A missing record is a `404` from the controller's ownership check; the service
      // must not turn it into a size error by reading a facility for a booking it could
      // not load.
      modelMock.findOne.mockResolvedValue(null);

      await service.updateBooking('b1', {size: '3/4'} as never);

      expect(buildingModelMock.findOne).not.toHaveBeenCalled();
      expect(modelMock.updateOne).toHaveBeenCalled();
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

  describe('updateBookedTimes', () => {
    const DAY = new Date('2026-03-04T00:00:00.000Z');
    const slot = (overrides: Record<string, unknown> = {}) => ({
      day: DAY,
      startHours: new Date('2026-03-04T08:00:00.000Z'),
      endHours: new Date('2026-03-04T10:00:00.000Z'),
      status: 'INITIAL' as const,
      ...overrides,
    });

    beforeEach(() => {
      modelMock.findOne.mockReset();
      modelMock.updateOne.mockReset();
      modelMock.updateOne.mockResolvedValue({matchedCount: 1, modifiedCount: 1});
    });

    it('replaces the slots when every resolved slot is preserved', async () => {
      modelMock.findOne.mockResolvedValue({bookedTimes: [slot({status: 'DONE', participants: 4})]});
      const incoming = [slot({status: 'DONE', participants: 4})];

      await service.updateBookedTimes('b1', incoming);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).toMatchObject({bookedTimes: incoming});
    });

    it('refuses to delete a resolved slot and does not write', async () => {
      modelMock.findOne.mockResolvedValue({bookedTimes: [slot({status: 'DONE'})]});

      await expect(service.updateBookedTimes('b1', [])).rejects.toMatchObject({
        status: 409,
        message: 'Nie można skasować pola które zostało rozliczone',
      });
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('refuses to edit a resolved slot and does not write', async () => {
      modelMock.findOne.mockResolvedValue({bookedTimes: [slot({status: 'DONE'})]});

      await expect(
        service.updateBookedTimes('b1', [slot({status: 'DONE', endHours: new Date('2026-03-04T11:00:00.000Z')})])
      ).rejects.toMatchObject({status: 409});
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('records the actor and the timestamp with the write', async () => {
      modelMock.findOne.mockResolvedValue({bookedTimes: []});

      await service.updateBookedTimes('b1', [slot()]);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).toHaveProperty('modifiedAt');
    });

    it('answers 404 for a booking that does not exist', async () => {
      modelMock.findOne.mockResolvedValue(null);

      await expect(service.updateBookedTimes('missing', [slot()])).rejects.toMatchObject({status: 404});
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('treats a booking with no stored slots as having none to preserve', async () => {
      // A legacy or partially-migrated record can carry no `bookedTimes`; the check then has
      // nothing to compare against rather than throwing on `undefined`.
      modelMock.findOne.mockResolvedValue({});

      await expect(service.updateBookedTimes('b1', [slot()])).resolves.toBeDefined();
    });
  });

  describe('updateBooking strips the fields owned by other routes', () => {
    beforeEach(() => {
      modelMock.updateOne.mockReset();
      modelMock.updateOne.mockResolvedValue({matchedCount: 1, modifiedCount: 1});
    });

    it('does not write bookedTimes, so the resolved-slot rule cannot be bypassed', async () => {
      // A `BookingDto` declares `bookedTimes`; without the strip an owner could replace
      // the slots here and skip the FR-018 check that runs on the booked-times route.
      await service.updateBooking('b1', {bookedTimes: [], comments: 'x'} as never);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).not.toHaveProperty('bookedTimes');
      expect(update).toMatchObject({comments: 'x'});
    });

    it('treats an update that strips down to nothing as a success', async () => {
      // After `createdBy`/`accepted`/`archive`/`bookedTimes` are removed the document can be
      // empty; MongoDB rejects an empty update, so the no-op is answered here instead.
      await service.updateBooking('b1', {accepted: true, archive: true} as never);

      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('maps a driver error onto an HTTP exception', async () => {
      modelMock.updateOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.updateBooking('b1', {comments: 'x'} as never)).rejects.toMatchObject({status: 500});
    });

    it('ignores a body-supplied extraOptions flag and derives it from selectedOptions', async () => {
      // The flag is derived, so a body that sets it must not be trusted; it is recomputed
      // from the add-ons the same request carries.
      await service.updateBooking('b1', {extraOptions: false, selectedOptions: [{options: [{lights: true}]}]} as never);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).toMatchObject({extraOptions: true});
    });

    it('derives extraOptions as false when the add-ons are cleared', async () => {
      await service.updateBooking('b1', {selectedOptions: []} as never);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).toMatchObject({extraOptions: false});
    });

    it('leaves extraOptions untouched when the body does not change the add-ons', async () => {
      await service.updateBooking('b1', {comments: 'x'} as never);

      const [, update] = modelMock.updateOne.mock.calls[0];
      expect(update).not.toHaveProperty('extraOptions');
    });
  });

  describe('error paths', () => {
    it('maps a driver error in deleteBooking onto an HTTP exception', async () => {
      modelMock.deleteOne.mockReset();
      modelMock.deleteOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.deleteBooking('b1')).rejects.toMatchObject({status: 500});
    });

    it('maps a non-HTTP error in updateBookedTimes onto an HTTP exception', async () => {
      modelMock.findOne.mockReset();
      modelMock.findOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.updateBookedTimes('b1', [])).rejects.toMatchObject({status: 500});
    });

    it('maps a driver error in setApproval onto an HTTP exception', async () => {
      modelMock.findOne.mockReset();
      modelMock.findOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.setApproval('b1', false, false)).rejects.toMatchObject({status: 500});
    });

    it('maps a driver error in setArchive onto an HTTP exception', async () => {
      modelMock.findOneAndUpdate.mockReset();
      modelMock.findOneAndUpdate.mockRejectedValue(new Error('connection lost'));

      await expect(service.setArchive('b1', true)).rejects.toMatchObject({status: 500});
    });

    it('answers 422 when an anonymous list request names no period', async () => {
      // `resolveBookingListRequest` throws the domain error; the service is what maps it to
      // the contract's 422 rather than letting it surface as a 500.
      await expect(service.findAllBooking({}, false)).rejects.toMatchObject({status: 422});
    });

    it('re-throws a resolver failure that is not the range error', async () => {
      // The `BookingRangeRequiredError` branch maps to 422; anything else must not be
      // swallowed into a `500`, or a programming error in the resolver would look like a
      // database failure.
      const spy = jest.spyOn(bookingList, 'resolveBookingListRequest').mockImplementation(() => {
        throw new Error('resolver exploded');
      });

      await expect(service.findAllBooking({}, true)).rejects.toThrow('resolver exploded');
      spy.mockRestore();
    });
  });
});
