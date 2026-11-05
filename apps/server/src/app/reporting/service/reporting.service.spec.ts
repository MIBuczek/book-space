import {Test, TestingModule} from '@nestjs/testing';
import {getModelToken} from '@nestjs/mongoose';
import {HttpException, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {ReportingService} from './reporting.service';

/**
 * The unit spec drives the service against a model stub. The integration spec proves the route
 * wiring and the real aggregation over MongoDB; here the properties under test are the ones a
 * database error would otherwise turn into a silent success — a malformed id must surface as a
 * 500, not a 200 — and the fail-closed range.
 */
describe('ReportingService', () => {
  let service: ReportingService;

  const clientModel = {findOne: jest.fn(), find: jest.fn()};
  const bookingModel = {find: jest.fn()};

  beforeEach(async () => {
    clientModel.findOne.mockReset();
    clientModel.find.mockReset();
    bookingModel.find.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        {provide: getModelToken('Client'), useValue: clientModel},
        {provide: getModelToken('Booking'), useValue: bookingModel}
      ]
    }).compile();

    service = module.get<ReportingService>(ReportingService);
  });

  const leanClient = {_id: 'c1', name: 'Klub Sportowy'};

  it('rejects a summary without a client id', async () => {
    await expect(service.summary({})).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('answers 404 for an unknown client', async () => {
    clientModel.findOne.mockReturnValue({lean: () => Promise.resolve(null)});
    await expect(service.summary({clientId: 'c1'})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps a client lookup failure to a 500, not a silent success', async () => {
    clientModel.findOne.mockReturnValue({lean: () => Promise.reject(new Error('Cast to ObjectId failed'))});
    await expect(service.summary({clientId: 'bad-id'})).rejects.toMatchObject({status: 500});
  });

  it('maps a booking query failure to a 500', async () => {
    clientModel.findOne.mockReturnValue({lean: () => Promise.resolve(leanClient)});
    bookingModel.find.mockReturnValue({lean: () => Promise.reject(new Error('boom'))});
    await expect(service.summary({clientId: 'c1', fromTheBeginning: true})).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects a partial range through the service, not only the pipe', async () => {
    // A caller that bypasses the DTO must still be refused: `resolveSummaryRange` is the
    // defence that survives the pipe being skipped.
    clientModel.findOne.mockReturnValue({lean: () => Promise.resolve(leanClient)});
    await expect(service.summary({clientId: 'c1', fromMonth: new Date('2026-03-01')})).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
  });

  it('builds the CSV for every client when no client id is given', async () => {
    clientModel.find.mockReturnValue({lean: () => Promise.resolve([leanClient])});
    bookingModel.find.mockReturnValue({lean: () => Promise.resolve([])});

    const csv = await service.csv({fromTheBeginning: true});

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Imie i nazwisko');
  });

  it('builds the CSV for one client when a client id is given', async () => {
    clientModel.findOne.mockReturnValue({lean: () => Promise.resolve(leanClient)});
    bookingModel.find.mockReturnValue({lean: () => Promise.resolve([])});

    const csv = await service.csv({clientId: 'c1', fromTheBeginning: true});

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(clientModel.find).not.toHaveBeenCalled();
  });
});
