import {Test, TestingModule} from '@nestjs/testing';
import {ConfigService} from '@nestjs/config';
import {getModelToken} from '@nestjs/mongoose';
import {BadGatewayException, NotFoundException} from '@nestjs/common';
import {NotificationService} from './notification.service';
import {IMailMessage, MAIL_TRANSPORT} from '../mail/mail-transport';
import {StructuredLogger} from '../../logging/structured-logger';

/**
 * The unit spec drives the service against a recording transport and a model stub. The
 * recipient resolution and the failure mapping are the properties under test: the integration
 * spec proves the route wiring, but the "which address did this audience resolve to" decision
 * is a service one and is cheapest to pin here.
 */
describe('NotificationService', () => {
  let service: NotificationService;
  let sent: IMailMessage[];

  const bookingModel = {findOne: jest.fn()};
  const buildingModel = {findOne: jest.fn()};
  const loggerMock = {log: jest.fn(), warn: jest.fn(), error: jest.fn(), notificationFailure: jest.fn()};

  const config = new Map<string, string>();

  beforeEach(async () => {
    bookingModel.findOne.mockReset();
    buildingModel.findOne.mockReset();
    loggerMock.log.mockReset();
    loggerMock.notificationFailure.mockReset();
    config.clear();
    sent = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {provide: getModelToken('Booking'), useValue: bookingModel},
        {provide: getModelToken('Building'), useValue: buildingModel},
        {provide: StructuredLogger, useValue: loggerMock},
        {
          provide: ConfigService,
          useValue: {get: (key: string) => config.get(key)}
        },
        {
          provide: MAIL_TRANSPORT,
          useValue: {
            send: (message: IMailMessage) => {
              sent.push(message);
              return Promise.resolve();
            }
          }
        }
      ]
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  const booking = {
    _id: 'b1',
    place: {place: 'hala-sportowa', city: 'siechnice'},
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    paymentMethod: 'TRANSFER',
    bookedTimes: [
      {
        day: new Date('2026-03-04T10:00:00Z'),
        startHours: new Date('2026-03-04T10:00:00Z'),
        endHours: new Date('2026-03-04T11:00:00Z'),
        status: 'INITIAL' as const
      }
    ]
  };

  describe('notifyBooking', () => {
    it('resolves the facility address from the booking, not the request', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      buildingModel.findOne.mockResolvedValue({email: 'facility@example.com'});

      await service.notifyBooking({bookingId: 'b1', audience: 'FACILITY'});

      expect(buildingModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({property: 'hala-sportowa', city: 'siechnice'}),
        expect.anything()
      );
      expect(sent[0].to).toBe('facility@example.com');
    });

    it('resolves the staff address from configuration', async () => {
      config.set('SISK_CONTACT_EMAIL', 'biuro@example.com');
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});

      await service.notifyBooking({bookingId: 'b1', audience: 'STAFF'});

      expect(buildingModel.findOne).not.toHaveBeenCalled();
      expect(sent[0].to).toBe('biuro@example.com');
    });

    it('refuses a facility booking whose facility has no address', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      buildingModel.findOne.mockResolvedValue(null);

      await expect(service.notifyBooking({bookingId: 'b1', audience: 'FACILITY'})).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('refuses the staff audience when the mailbox is unconfigured', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      await expect(service.notifyBooking({bookingId: 'b1', audience: 'STAFF'})).rejects.toBeInstanceOf(
        BadGatewayException
      );
    });

    it('answers 404 for an unknown booking', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(null)});
      await expect(service.notifyBooking({bookingId: 'b1', audience: 'STAFF'})).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('maps a transport failure to 502 and logs it with the booking', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      config.set('SISK_CONTACT_EMAIL', 'biuro@example.com');
      // Rebuild with a failing transport.
      const module = await Test.createTestingModule({
        providers: [
          NotificationService,
          {provide: getModelToken('Booking'), useValue: bookingModel},
          {provide: getModelToken('Building'), useValue: buildingModel},
          {provide: StructuredLogger, useValue: loggerMock},
          {provide: ConfigService, useValue: {get: (key: string) => config.get(key)}},
          {provide: MAIL_TRANSPORT, useValue: {send: () => Promise.reject(new Error('provider down'))}}
        ]
      }).compile();
      const failing = module.get<NotificationService>(NotificationService);

      await expect(failing.notifyBooking({bookingId: 'b1', audience: 'STAFF'})).rejects.toBeInstanceOf(
        BadGatewayException
      );
      expect(loggerMock.notificationFailure).toHaveBeenCalledWith(
        expect.objectContaining({bookingId: 'b1', provider: 'mail'})
      );
    });
  });

  describe('sendMessage', () => {
    it('delivers to the SISK inbox by default', async () => {
      config.set('SISK_CONTACT_EMAIL', 'biuro@example.com');
      await service.sendMessage({person: 'Anna', email: 'anna@example.com', message: 'Pytanie'});
      expect(sent[0].to).toBe('biuro@example.com');
      expect(sent[0].text).toContain('Pytanie');
    });

    it('delivers to a named facility employee', async () => {
      await service.sendMessage({
        person: 'Anna',
        email: 'anna@example.com',
        message: 'Pytanie',
        recipient: 'employee@example.com'
      });
      expect(sent[0].to).toBe('employee@example.com');
    });

    it('refuses a contact message when the inbox is unconfigured', async () => {
      await expect(
        service.sendMessage({person: 'Anna', email: 'anna@example.com', message: 'Pytanie'})
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
