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

  beforeEach(async () => {
    findAllBooking = jest.fn().mockResolvedValue([storedBooking()]);
    findBooking = jest.fn().mockResolvedValue(storedBooking({createdBy: 'u2'}));
    createBooking = jest.fn().mockResolvedValue(storedBooking());
    updateBooking = jest.fn().mockResolvedValue({matchedCount: 1});
    deleteBooking = jest.fn().mockResolvedValue({deletedCount: 1});

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        {provide: BookingService, useValue: {findAllBooking, findBooking, createBooking, updateBooking, deleteBooking}},
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
      const result = await controller.getAllBookings({isPublic: true} as never, undefined);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('personName');
      expect(result[0]).not.toHaveProperty('personEmail');
      expect(result[0]).not.toHaveProperty('personPhone');
      expect(result[0]).not.toHaveProperty('comments');
    });

    it('asks the service for the restricted set for a public caller', async () => {
      await controller.getAllBookings({isPublic: true} as never, undefined);

      expect(findAllBooking).toHaveBeenCalledWith(false);
    });

    it('returns the full record to an administrator', async () => {
      const result = await controller.getAllBookings({isPublic: false} as never, ADMIN);

      expect(result[0]).toHaveProperty('personName', 'Jan Kowalski');
      expect(result[0]).toHaveProperty('personEmail', 'jan@example.com');
    });

    it('returns the full record to an employee', async () => {
      // The matrix gives every staff role the unfiltered read, not only administrators.
      const result = await controller.getAllBookings({isPublic: false} as never, EMPLOYEE);

      expect(findAllBooking).toHaveBeenCalledWith(true);
      expect(result[0]).toHaveProperty('personName', 'Jan Kowalski');
    });

    it('fails closed when the guard did not mark the request', async () => {
      // `isPublic` absent means the guard never ran. Serving the full record there
      // would leak personal data on any routing mistake, so absent reads as public.
      const result = await controller.getAllBookings({} as never, undefined);

      expect(result[0]).not.toHaveProperty('personName');
      expect(findAllBooking).toHaveBeenCalledWith(false);
    });

    it('fails closed when a user is present but carries no recognised role', async () => {
      // A user object that is not staff must not widen the scope; only a role does.
      const result = await controller.getAllBookings({isPublic: false} as never, {
        _id: 'u3',
        email: 'nobody@example.com',
      });

      expect(findAllBooking).toHaveBeenCalledWith(false);
      expect(result[0]).not.toHaveProperty('personName');
    });
  });

  describe('createBooking', () => {
    it('stamps the creator from the authenticated user, not the body', async () => {
      await controller.createBooking({} as never, EMPLOYEE);

      expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({createdBy: 'u2'}));
    });

    it('does not let a body-supplied createdBy win over the authenticated user', async () => {
      // The DTO does not declare `createdBy`, so the global pipe rejects it — but the
      // controller is what decides the value, so it is asserted here too.
      await controller.createBooking({createdBy: 'someone-else'} as never, EMPLOYEE);

      expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({createdBy: 'u2'}));
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
