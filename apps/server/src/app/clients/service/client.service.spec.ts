import {Test, TestingModule} from '@nestjs/testing';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {HttpException, NotFoundException} from '@nestjs/common';
import {ClientService} from './client.service';

/**
 * A stored document is what `updateClient` merges against, so the mock `findOne`
 * returns an object with `toObject()`. Returning a bare record would make the service
 * throw a TypeError and the merge would never be exercised.
 */
const storedCompany = (overrides: Record<string, unknown> = {}) => ({
  _id: 'abc',
  type: 'COMPANY',
  name: 'Firma',
  contactPerson: 'Jan',
  phone: '609996064',
  email: 'firma@example.com',
  street: 'ul. Sportowa 1',
  city: 'siechnice',
  zipCode: '55-010',
  nip: '8991234567',
  toObject() {
    return {...this, toObject: undefined};
  },
  ...overrides,
});

describe('ClientService', () => {
  let service: ClientService;
  let modelMock: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let bookingModelMock: {countDocuments: jest.Mock};

  beforeEach(async () => {
    modelMock = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({matchedCount: 1}),
      deleteOne: jest.fn(),
      countDocuments: jest.fn(),
    };
    // Default: no booking references the client, so a delete proceeds. A test that wants
    // the refused path sets this to a positive count.
    bookingModelMock = {countDocuments: jest.fn().mockResolvedValue(0)};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        {provide: getModelToken('Client'), useValue: modelMock},
        {provide: getModelToken('Booking'), useValue: bookingModelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a client through the model', async () => {
    const payload = {type: 'INDIVIDUAL', name: 'Jan'};
    modelMock.create.mockResolvedValue(payload);

    await expect(service.createClient(payload as never)).resolves.toEqual(payload);
    expect(modelMock.create).toHaveBeenCalledWith(payload);
  });

  it('lists clients as a page with a pre-pagination total', async () => {
    modelMock.find.mockResolvedValue([{name: 'Jan'}]);
    modelMock.countDocuments.mockResolvedValue(1);

    await expect(service.findAllClients()).resolves.toEqual({
      items: [{name: 'Jan'}],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(modelMock.find).toHaveBeenCalledWith(
      {},
      null,
      {sort: {name: 1, _id: 1}, skip: 0, limit: 50, lean: true},
    );
    expect(modelMock.countDocuments).toHaveBeenCalledWith({});
  });

  it('passes the page and limit through to the query', async () => {
    modelMock.find.mockResolvedValue([]);
    modelMock.countDocuments.mockResolvedValue(0);

    await expect(service.findAllClients({page: 3, limit: 10})).resolves.toEqual({
      items: [],
      total: 0,
      page: 3,
      limit: 10,
    });
    expect(modelMock.find).toHaveBeenCalledWith(
      {},
      null,
      {sort: {name: 1, _id: 1}, skip: 20, limit: 10, lean: true},
    );
  });

  it('searches name, contact person, e-mail and phone case-insensitively', async () => {
    modelMock.find.mockResolvedValue([]);
    modelMock.countDocuments.mockResolvedValue(0);

    await service.findAllClients({search: 'kowalski'});

    const pattern = {$regex: 'kowalski', $options: 'i'};
    expect(modelMock.find).toHaveBeenCalledWith(
      {
        $or: [
          {name: pattern},
          {contactPerson: pattern},
          {email: pattern},
          {phone: pattern},
        ],
      },
      null,
      expect.anything(),
    );
  });

  it('reads one client', async () => {
    modelMock.findOne.mockResolvedValue(null);

    await expect(service.findClient('abc')).resolves.toBeNull();
    expect(modelMock.findOne).toHaveBeenCalledWith({_id: 'abc'});
  });

  it('deletes one client when no booking references it', async () => {
    modelMock.deleteOne.mockResolvedValue({deletedCount: 1});

    await expect(service.deleteClient('abc')).resolves.toEqual({deletedCount: 1});
    expect(bookingModelMock.countDocuments).toHaveBeenCalledWith({clientId: 'abc'});
    expect(modelMock.deleteOne).toHaveBeenCalledWith({_id: 'abc'});
  });

  it('refuses to delete a client a booking still references, with 409', async () => {
    bookingModelMock.countDocuments.mockResolvedValue(2);

    await expect(service.deleteClient('abc')).rejects.toMatchObject({status: 409});
    expect(modelMock.deleteOne).not.toHaveBeenCalled();
  });

  it('wraps a failure of the booking reference count as a 500', async () => {
    bookingModelMock.countDocuments.mockRejectedValue(new Error('cast error'));

    const error = await service.deleteClient('abc').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(500);
    expect(modelMock.deleteOne).not.toHaveBeenCalled();
  });

  it('writes the active flag through the update allow-list', async () => {
    modelMock.findOne.mockResolvedValue(storedCompany());

    await service.updateClient('abc', {active: false});

    expect(modelMock.updateOne).toHaveBeenCalledWith({_id: 'abc'}, {active: false});
  });

  describe('updateClient', () => {
    it('answers 404 for an id that is not stored', async () => {
      modelMock.findOne.mockResolvedValue(null);

      await expect(service.updateClient('abc', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('refuses a company left without a NIP', async () => {
      // The rule is enforced on the merged record: a partial body may carry `type`
      // without `nip`, and `updateOne` does not run the schema validator.
      modelMock.findOne.mockResolvedValue(storedCompany({nip: undefined}));

      await expect(service.updateClient('abc', {name: 'Nowa nazwa'})).rejects.toMatchObject({
        status: 422,
      });
      expect(modelMock.updateOne).not.toHaveBeenCalled();
    });

    it('refuses an update that turns an individual into a company with no NIP', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany({type: 'INDIVIDUAL', nip: undefined}));

      await expect(service.updateClient('abc', {type: 'COMPANY'})).rejects.toMatchObject({
        status: 422,
      });
    });

    it('refuses a NIP added to an individual', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany({type: 'INDIVIDUAL', nip: undefined}));

      await expect(service.updateClient('abc', {nip: '8991234567'})).rejects.toMatchObject({
        status: 422,
      });
    });

    it('accepts an individual updated without a NIP', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany({type: 'INDIVIDUAL', nip: undefined}));

      await expect(service.updateClient('abc', {name: 'Nowa nazwa'})).resolves.toEqual({
        matchedCount: 1,
      });
    });

    it('accepts a company updated without touching its NIP', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany());

      await expect(service.updateClient('abc', {name: 'Nowa nazwa'})).resolves.toEqual({
        matchedCount: 1,
      });
    });

    it('writes only the fields the caller supplied', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany());

      await service.updateClient('abc', {name: 'Nowa nazwa', nick: 'Firma'});

      expect(modelMock.updateOne).toHaveBeenCalledWith(
        {_id: 'abc'},
        {name: 'Nowa nazwa', nick: 'Firma'},
      );
    });

    it('never writes the audit timestamps', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany());

      await service.updateClient('abc', {
        name: 'Nowa nazwa',
        createdAt: new Date(0),
      } as never);

      const [, update] = modelMock.updateOne.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(update).not.toHaveProperty('createdAt');
      expect(update).not.toHaveProperty('updatedAt');
    });

    it('wraps a driver failure as a 500 with the driver message', async () => {
      modelMock.findOne.mockResolvedValue(storedCompany());
      modelMock.updateOne.mockRejectedValue(new Error('cast error'));

      const error = await service.updateClient('abc', {name: 'Nowa nazwa'}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
    });

    it('wraps a failure to load the stored record as a 500', async () => {
      modelMock.findOne.mockRejectedValue(new Error('cast error'));

      const error = await service.updateClient('abc', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
    });
  });

  describe('error mapping', () => {
    // Every read and write wraps a driver failure rather than letting the raw error
    // escape, which is what stops a 5xx carrying the driver's message to the client.
    const cases: Array<[string, () => Promise<unknown>, keyof typeof modelMock]> = [
      ['createClient', () => service.createClient({} as never), 'create'],
      ['findClient', () => service.findClient('abc'), 'findOne'],
      ['findAllClients', () => service.findAllClients(), 'find'],
      ['deleteClient', () => service.deleteClient('abc'), 'deleteOne'],
    ];

    it.each(cases)('wraps a driver failure in %s as a 500', async (_name, call, method) => {
      modelMock[method].mockRejectedValue(new Error('driver exploded'));

      const error = await call().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).message).toBe('driver exploded');
    });
  });
});
