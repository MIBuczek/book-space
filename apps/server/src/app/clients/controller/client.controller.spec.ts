import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {ClientController} from './client.controller';
import {ClientService} from '../service/client.service';
import {RolesGuard} from '../../authorization/guards/roles.guard';

describe('ClientController', () => {
  let controller: ClientController;
  let service: {
    findAllClients: jest.Mock;
    findClient: jest.Mock;
    createClient: jest.Mock;
    updateClient: jest.Mock;
    deleteClient: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAllClients: jest.fn(),
      findClient: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        {provide: ClientService, useValue: service},
        {provide: getModelToken('User'), useValue: {}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      // This suite exercises handler wiring, not authorisation, so the role guard is
      // stubbed; the role rules are pinned in the integration spec.
      .overrideGuard(RolesGuard)
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<ClientController>(ClientController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists clients through the service with the query', async () => {
    const query = {search: 'Jan', page: 2};
    await controller.getAllClients(query as never);
    expect(service.findAllClients).toHaveBeenCalledWith(query);
  });

  it('forwards the id when reading one client', async () => {
    await controller.getSingleClient('abc');
    expect(service.findClient).toHaveBeenCalledWith('abc');
  });

  it('forwards the body when creating a client', async () => {
    const body = {name: 'Jan'} as never;
    await controller.createClient(body);
    expect(service.createClient).toHaveBeenCalledWith(body);
  });

  it('forwards both the id and the body when updating a client', async () => {
    const body = {nick: 'Kowalski'} as never;
    await controller.updateClient('abc', body);
    expect(service.updateClient).toHaveBeenCalledWith('abc', body);
  });

  it('forwards the id when deleting a client', async () => {
    await controller.deleteClient('abc');
    expect(service.deleteClient).toHaveBeenCalledWith('abc');
  });
});
