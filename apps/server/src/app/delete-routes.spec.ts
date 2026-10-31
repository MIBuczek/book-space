import {INestApplication} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {ClientController} from './clients/controller/client.controller';
import {ClientService} from './clients/service/client.service';
import {BuildingController} from './buildings/controller/building.controller';
import {BuildingService} from './buildings/service/building.service';

// These routes are declared with a literal `_id` segment instead of a parameter, so
// `DELETE /api/<resource>/<real-id>` never matches and the handlers are unreachable.
// The test drives real HTTP requests rather than inspecting metadata, because the
// defect is precisely about whether a request with an id matches at all.
describe('DELETE routes by id', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clientService = {deleteClient: jest.fn()};
  const buildingService = {deleteBuilding: jest.fn()};

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController, BuildingController],
      providers: [
        {provide: ClientService, useValue: clientService},
        {provide: BuildingService, useValue: buildingService},
        {provide: getModelToken('User'), useValue: {}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    app = module.createNestApplication();
    // Bind to IPv4 explicitly: `app.getUrl()` reports the IPv6 loopback, which is not
    // reachable in every environment this suite runs in.
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clientService.deleteClient.mockReset();
    buildingService.deleteBuilding.mockReset();
  });

  it('DELETE /api/clients/:id reaches the handler and passes the id', async () => {
    clientService.deleteClient.mockResolvedValue({deletedCount: 1});

    const res = await fetch(`${baseUrl}/clients/507f1f77bcf86cd799439011`, {method: 'DELETE'});

    expect(res.status).toBe(200);
    expect(clientService.deleteClient).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('DELETE /api/buildings/:id reaches the handler and passes the id', async () => {
    buildingService.deleteBuilding.mockResolvedValue({deletedCount: 1});

    const res = await fetch(`${baseUrl}/buildings/507f1f77bcf86cd799439011`, {method: 'DELETE'});

    expect(res.status).toBe(200);
    expect(buildingService.deleteBuilding).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('returns the same status as the other delete routes when the id does not exist', async () => {
    clientService.deleteClient.mockResolvedValue({deletedCount: 0});
    buildingService.deleteBuilding.mockResolvedValue({deletedCount: 0});

    const clientRes = await fetch(`${baseUrl}/clients/507f1f77bcf86cd799439012`, {method: 'DELETE'});
    const buildingRes = await fetch(`${baseUrl}/buildings/507f1f77bcf86cd799439012`, {
      method: 'DELETE'
    });

    expect(clientRes.status).toBe(200);
    expect(buildingRes.status).toBe(200);
    expect(await clientRes.json()).toEqual({deletedCount: 0});
    expect(await buildingRes.json()).toEqual({deletedCount: 0});
  });

  it('names no building handler after clients', () => {
    const handlers = Object.getOwnPropertyNames(BuildingController.prototype);
    const misleading = handlers.filter((name) => /Client/.test(name));

    expect(misleading).toEqual([]);
  });
});
