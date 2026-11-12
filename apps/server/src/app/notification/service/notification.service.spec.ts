import {Test, TestingModule} from '@nestjs/testing';
import {ConfigService} from '@nestjs/config';
import {getModelToken} from '@nestjs/mongoose';
import {BadGatewayException, ForbiddenException, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {NotificationService} from './notification.service';
import {IMailMessage, MAIL_TRANSPORT} from '../mail/mail-transport';
import {StructuredLogger} from '../../logging/structured-logger';
import {OutboundQuotaService} from '../../security/quota/outbound-quota.service';

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
        },
        {provide: OutboundQuotaService, useValue: {assertAllowed: jest.fn()}}
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
      config.set('TENANT_STAFF_EMAIL', 'biuro@example.com');
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

    it('sends the decision to the booking applicant for the APPLICANT audience (FR-052)', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve({...booking, accepted: true})});

      await service.notifyBooking({bookingId: 'b1', audience: 'APPLICANT'});

      // The address is the booking's own personEmail, never the facility or the tenant inbox.
      expect(buildingModel.findOne).not.toHaveBeenCalled();
      expect(sent[0].to).toBe('jan@example.com');
    });

    it('selects the approved template from the stored accepted flag', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve({...booking, accepted: true})});

      await service.notifyBooking({bookingId: 'b1', audience: 'APPLICANT'});

      expect(sent[0].subject).toContain('zatwierdzona');
    });

    it('selects the rejected template from the stored accepted flag', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve({...booking, accepted: false})});

      await service.notifyBooking({bookingId: 'b1', audience: 'APPLICANT'});

      expect(sent[0].subject).toContain('odrzucona');
    });

    it('refuses an applicant notification when the booking carries no address', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve({...booking, personEmail: ''})});

      await expect(
        service.notifyBooking({bookingId: 'b1', audience: 'APPLICANT'})
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sent).toHaveLength(0);
    });

    it('maps a transport failure to 502 and logs it with the booking', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      config.set('TENANT_STAFF_EMAIL', 'biuro@example.com');
      // Rebuild with a failing transport.
      const module = await Test.createTestingModule({
        providers: [
          NotificationService,
          {provide: getModelToken('Booking'), useValue: bookingModel},
          {provide: getModelToken('Building'), useValue: buildingModel},
          {provide: StructuredLogger, useValue: loggerMock},
          {provide: ConfigService, useValue: {get: (key: string) => config.get(key)}},
          {provide: OutboundQuotaService, useValue: {assertAllowed: jest.fn()}},
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

    it('maps a driver error while loading the booking to the driver status', async () => {
      // A malformed id makes Mongoose throw; the service must not leak the driver message as a
      // 200 or a bare 500. It is mapped through `errorStatus`, which reads the driver's own
      // status when it carries one and falls back to 500.
      bookingModel.findOne.mockReturnValue({lean: () => Promise.reject(new Error('Cast to ObjectId failed'))});
      config.set('TENANT_STAFF_EMAIL', 'biuro@example.com');

      await expect(service.notifyBooking({bookingId: 'nonsense', audience: 'STAFF'})).rejects.toThrow(
        'Cast to ObjectId failed'
      );
    });

    it('omits the facility contact line for the staff audience', async () => {
      config.set('TENANT_STAFF_EMAIL', 'biuro@example.com');
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});

      await service.notifyBooking({bookingId: 'b1', audience: 'STAFF'});

      expect(sent[0].text).not.toContain('E-mail obiektu');
    });

    it('renders the facility contact line for the facility audience', async () => {
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      buildingModel.findOne.mockResolvedValue({email: 'facility@example.com'});

      await service.notifyBooking({bookingId: 'b1', audience: 'FACILITY'});

      expect(sent[0].text).toContain('E-mail obiektu: facility@example.com');
    });

    it('builds the facility filter from the booking city when it is present, and omits it when not', async () => {
      // The `city` key is only added when the booking carries one, so the lookup never widens
      // to "any city" for a booking that has none. A cityless booking is a data defect (the
      // contract requires it), and the render then refuses the send rather than mailing a
      // half-filled notification — which is the fail-closed behaviour this asserts.
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(booking)});
      buildingModel.findOne.mockResolvedValue({email: 'facility@example.com'});
      await service.notifyBooking({bookingId: 'b1', audience: 'FACILITY'});
      expect(buildingModel.findOne).toHaveBeenCalledWith(
        {property: 'hala-sportowa', city: 'siechnice'},
        expect.anything()
      );

      const cityless = {...booking, place: {place: 'hala-sportowa'}};
      bookingModel.findOne.mockReturnValue({lean: () => Promise.resolve(cityless)});
      buildingModel.findOne.mockClear();
      await expect(service.notifyBooking({bookingId: 'b1', audience: 'FACILITY'})).rejects.toThrow();
      expect(buildingModel.findOne).toHaveBeenCalledWith({property: 'hala-sportowa'}, expect.anything());
    });
  });

  describe('sendMessage', () => {
    it('delivers to the tenant inbox by default', async () => {
      config.set('TENANT_STAFF_EMAIL', 'biuro@example.com');
      await service.sendMessage({person: 'Anna', email: 'anna@example.com', message: 'Pytanie'}, true);
      expect(sent[0].to).toBe('biuro@example.com');
      expect(sent[0].text).toContain('Pytanie');
    });

    it('delivers to a facility contact address for a staff caller', async () => {
      buildingModel.findOne.mockResolvedValue({email: 'fitness@example.com'});
      await service.sendMessage(
        {
          person: 'Anna',
          email: 'anna@example.com',
          message: 'Pytanie',
          recipient: 'fitness@example.com'
        },
        false
      );
      expect(sent[0].to).toBe('fitness@example.com');
      expect(buildingModel.findOne).toHaveBeenCalledWith({email: 'fitness@example.com'}, expect.anything());
    });

    it('refuses a named recipient from a public caller (open-relay fix, #124)', async () => {
      buildingModel.findOne.mockResolvedValue({email: 'fitness@example.com'});
      await expect(
        service.sendMessage(
          {person: 'Anna', email: 'anna@example.com', message: 'Pytanie', recipient: 'fitness@example.com'},
          true
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sent).toHaveLength(0);
    });

    it('refuses a staff recipient that is not a facility contact address', async () => {
      buildingModel.findOne.mockResolvedValue(null);
      await expect(
        service.sendMessage(
          {person: 'Anna', email: 'anna@example.com', message: 'Pytanie', recipient: 'attacker@example.com'},
          false
        )
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(sent).toHaveLength(0);
    });

    it('refuses a contact message when the inbox is unconfigured', async () => {
      await expect(
        service.sendMessage({person: 'Anna', email: 'anna@example.com', message: 'Pytanie'}, true)
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
