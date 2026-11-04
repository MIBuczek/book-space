import {Test, TestingModule} from '@nestjs/testing';
import {ForbiddenException, NotFoundException} from '@nestjs/common';
import {StructuredLogger} from '../../logging/structured-logger';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {BookingController} from './booking.controller';
import {BookingService} from '../service/booking.service';
import {IActingUser} from '../../authorization/ownership';

const ADMIN: IActingUser = {_id: 'u1', email: 'admin@example.com', role: 'ADMIN'};
const EMPLOYEE: IActingUser = {_id: 'u2', email: 'employee@example.com', role: 'EMPLOYEE'};
const OTHER_EMPLOYEE: IActingUser = {_id: 'u3', email: 'other@example.com', role: 'EMPLOYEE'};

const storedBooking = (overrides: Record<string, unknown> = {}) => ({
  _id: 'b1',
  place: {place: 'Hala', city: 'Siechnice'},
  size: 'X/X',
  nick: 'Rezerwacja',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '500100200',
  month: 3,
  bookedTimes: [{status: 'INITIAL'}],
  accepted: true,
  archive: false,
  comments: 'Proszę o kontakt',
  paymentMethod: 'CASH',
  ...overrides,
});

describe('BookingController', () => {
  let controller: BookingController;
  let findAllBooking: jest.Mock;
  let findBooking: jest.Mock;
  let createBooking: jest.Mock;
  let updateBooking: jest.Mock;
  let deleteBooking: jest.Mock;
  let findConflictingBookingIds: jest.Mock;
  let setApproval: jest.Mock;
  let setArchive: jest.Mock;
  let updateBookedTimes: jest.Mock;

  beforeEach(async () => {
    findAllBooking = jest.fn().mockResolvedValue({items: [storedBooking()], total: 1, page: 1, limit: 50});
    findBooking = jest.fn().mockResolvedValue(storedBooking({createdBy: 'u2'}));
    createBooking = jest.fn().mockResolvedValue(storedBooking());
    updateBooking = jest.fn().mockResolvedValue({matchedCount: 1});
    deleteBooking = jest.fn().mockResolvedValue({deletedCount: 1});
    findConflictingBookingIds = jest.fn().mockResolvedValue(['b2', 'b3']);
    setApproval = jest.fn().mockResolvedValue({booking: storedBooking({accepted: true}), conflicts: []});
    setArchive = jest.fn().mockResolvedValue(storedBooking({archive: true}));
    updateBookedTimes = jest.fn().mockResolvedValue({matchedCount: 1, modifiedCount: 1});

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        {provide: BookingService, useValue: {findAllBooking, findBooking, createBooking, updateBooking, deleteBooking, findConflictingBookingIds, setApproval, setArchive, updateBookedTimes}},
        {provide: getModelToken('User'), useValue: {}},
        {provide: StructuredLogger, useValue: {log: jest.fn(), warn: jest.fn(), error: jest.fn()}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<BookingController>(BookingController);
  });

  describe('getAllBookings', () => {
    it('is defined', () => {
      expect(controller).toBeDefined();
    });

    it('redacts the response for a public caller', async () => {
      const result = await controller.getAllBookings({isPublic: true} as never, {}, undefined);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty('personName');
      expect(result.items[0]).not.toHaveProperty('personEmail');
      expect(result.items[0]).not.toHaveProperty('personPhone');
      expect(result.items[0]).not.toHaveProperty('comments');
    });

    it('keeps the paging fields on the redacted envelope', async () => {
      const result = await controller.getAllBookings({isPublic: true} as never, {}, undefined);

      expect(result).toMatchObject({total: 1, page: 1, limit: 50});
    });

    it('asks the service for the restricted set for a public caller', async () => {
      await controller.getAllBookings({isPublic: true} as never, {}, undefined);

      expect(findAllBooking).toHaveBeenCalledWith({}, false);
    });

    it('returns the full record to an administrator', async () => {
      const result = await controller.getAllBookings({isPublic: false} as never, {}, ADMIN);

      expect(result.items[0]).toHaveProperty('personName', 'Jan Kowalski');
      expect(result.items[0]).toHaveProperty('personEmail', 'jan@example.com');
    });

    it('returns the full record to an employee', async () => {
      // The matrix gives every staff role the unfiltered read, not only administrators.
      const result = await controller.getAllBookings({isPublic: false} as never, {}, EMPLOYEE);

      expect(findAllBooking).toHaveBeenCalledWith({}, true);
      expect(result.items[0]).toHaveProperty('personName', 'Jan Kowalski');
    });

    it('fails closed when the guard did not mark the request', async () => {
      // `isPublic` absent means the guard never ran. Serving the full record there
      // would leak personal data on any routing mistake, so absent reads as public.
      const result = await controller.getAllBookings({} as never, {}, undefined);

      expect(result.items[0]).not.toHaveProperty('personName');
      expect(findAllBooking).toHaveBeenCalledWith({}, false);
    });

    it('fails closed when a user is present but carries no recognised role', async () => {
      // A user object that is not staff must not widen the scope; only a role does.
      const result = await controller.getAllBookings({isPublic: false} as never, {}, {
        _id: 'u3',
        email: 'nobody@example.com',
      });

      expect(findAllBooking).toHaveBeenCalledWith({}, false);
      expect(result.items[0]).not.toHaveProperty('personName');
    });

    it('refuses a non-administrator who asks for every record', async () => {
      await expect(controller.getAllBookings({isPublic: false} as never, {all: true}, EMPLOYEE)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(findAllBooking).not.toHaveBeenCalled();
    });

    it('lets an administrator ask for every record', async () => {
      await controller.getAllBookings({isPublic: false} as never, {all: true}, ADMIN);

      expect(findAllBooking).toHaveBeenCalledWith({all: true}, true);
    });

    it('refuses a public caller who asks for every record', async () => {
      // `isPublic` reads as public even if the flag is somehow absent, so `all` cannot
      // be used to widen an unauthenticated read.
      await expect(controller.getAllBookings({isPublic: true} as never, {all: true}, undefined)).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });
  });

  describe('getConflicts', () => {
    it('passes the facility and month to the service', async () => {
      await controller.getConflicts({city: 'siechnice', building: 'hala', month: 3});

      expect(findConflictingBookingIds).toHaveBeenCalledWith('siechnice', 'hala', 3);
    });

    it('returns the ids the service produced', async () => {
      await expect(controller.getConflicts({city: 'siechnice', building: 'hala', month: 3})).resolves.toEqual(['b2', 'b3']);
    });
  });

  describe('approveBooking', () => {
    it('passes the decision and the force flag to the service', async () => {
      await controller.approveBooking('b1', {accepted: true, force: true});

      expect(setApproval).toHaveBeenCalledWith('b1', true, true);
    });

    it('defaults force to false when the body omits it', async () => {
      // The pipe does not require `force`, so the controller has to supply the default
      // rather than passing `undefined` to a service that treats truthiness as consent.
      await controller.approveBooking('b1', {accepted: false});

      expect(setApproval).toHaveBeenCalledWith('b1', false, false);
    });

    it('returns the service result unchanged', async () => {
      await expect(controller.approveBooking('b1', {accepted: true})).resolves.toMatchObject({conflicts: []});
    });
  });

  describe('archiveBooking', () => {
    it('passes the archive flag to the service', async () => {
      await controller.archiveBooking('b1', {archive: true});

      expect(setArchive).toHaveBeenCalledWith('b1', true);
    });
  });

  describe('createBooking', () => {
    it('stamps the creator from the authenticated user, not the body', async () => {
      await controller.createBooking({} as never, EMPLOYEE);

      expect(createBooking).toHaveBeenCalledWith({}, 'u2');
    });

    it('does not let a body-supplied createdBy win over the authenticated user', async () => {
      // The DTO does not declare `createdBy`, so the global pipe rejects it — but the
      // controller is what decides the value, so it is asserted here too.
      await controller.createBooking({createdBy: 'someone-else'} as never, EMPLOYEE);

      expect(createBooking).toHaveBeenCalledWith({createdBy: 'someone-else'}, 'u2');
    });
  });

  describe('updateBooking', () => {
    it('lets the owner update their own booking', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await controller.updateBooking('b1', {} as never, EMPLOYEE);

      expect(updateBooking).toHaveBeenCalledWith('b1', {});
    });

    it('refuses a different staff member with 403', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await expect(controller.updateBooking('b1', {} as never, OTHER_EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateBooking).not.toHaveBeenCalled();
    });

    it('lets an administrator update any booking', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await controller.updateBooking('b1', {} as never, ADMIN);

      expect(updateBooking).toHaveBeenCalled();
    });

    it('does not treat a booking with no creator as owned by a staff member', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: undefined}));

      await expect(controller.updateBooking('b1', {} as never, EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 404 for a booking that does not exist', async () => {
      findBooking.mockResolvedValue(null);

      await expect(controller.updateBooking('missing', {} as never, EMPLOYEE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateBookedTimes', () => {
    const slot = () => ({
      day: new Date('2026-03-04T00:00:00.000Z'),
      startHours: new Date('2026-03-04T08:00:00.000Z'),
      endHours: new Date('2026-03-04T10:00:00.000Z'),
      status: 'INITIAL' as const,
    });

    it('passes the slot list to the service for the owner', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));
      const slots = [slot()];

      await controller.updateBookedTimes('b1', slots, EMPLOYEE);

      expect(updateBookedTimes).toHaveBeenCalledWith('b1', slots);
    });

    it('refuses a different staff member with 403 and does not write', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await expect(controller.updateBookedTimes('b1', [slot()], OTHER_EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateBookedTimes).not.toHaveBeenCalled();
    });

    it('lets an administrator replace the slots of any booking', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await controller.updateBookedTimes('b1', [slot()], ADMIN);

      expect(updateBookedTimes).toHaveBeenCalled();
    });

    it('answers 404 for a booking that does not exist', async () => {
      findBooking.mockResolvedValue(null);

      await expect(controller.updateBookedTimes('missing', [slot()], EMPLOYEE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteBooking', () => {
    it('lets the owner delete their own booking', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await controller.deleteBooking('b1', EMPLOYEE);

      expect(deleteBooking).toHaveBeenCalledWith('b1');
    });

    it('refuses a different staff member with 403', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await expect(controller.deleteBooking('b1', OTHER_EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenException);
      expect(deleteBooking).not.toHaveBeenCalled();
    });

    it('lets an administrator delete any booking', async () => {
      findBooking.mockResolvedValue(storedBooking({createdBy: 'u2'}));

      await controller.deleteBooking('b1', ADMIN);

      expect(deleteBooking).toHaveBeenCalledWith('b1');
    });
  });
});
