import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {BuildingController} from './building.controller';
import {BuildingService} from '../service/building.service';

/**
 * The controller is a thin pass-through to the service, so these tests assert the
 * delegation rather than re-testing behaviour the service spec already covers. The service
 * is stubbed for that reason, and the assertions are on the arguments the controller
 * forwards — which is where a wrong parameter would show up.
 */
describe('BuildingController', () => {
  let controller: BuildingController;
  let service: {
    findAllBuildings: jest.Mock;
    findBuilding: jest.Mock;
    createBuilding: jest.Mock;
    updateBuilding: jest.Mock;
    deleteBuilding: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAllBuildings: jest.fn().mockResolvedValue([]),
      findBuilding: jest.fn().mockResolvedValue(null),
      createBuilding: jest.fn().mockResolvedValue({}),
      updateBuilding: jest.fn().mockResolvedValue({matchedCount: 1}),
      deleteBuilding: jest.fn().mockResolvedValue({deletedCount: 1}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuildingController],
      providers: [
        {provide: BuildingService, useValue: service},
        {provide: getModelToken('User'), useValue: {}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<BuildingController>(BuildingController);
  });

  it('lists facilities through the service', async () => {
    await controller.getAllBuildings();

    expect(service.findAllBuildings).toHaveBeenCalledTimes(1);
  });

  it('forwards the id when reading one facility', async () => {
    await controller.getSingleBuilding('b1');

    expect(service.findBuilding).toHaveBeenCalledWith('b1');
  });

  it('forwards the body when creating a facility', async () => {
    const body = {property: 'hala-sportowa'} as never;

    await controller.createBuilding(body);

    expect(service.createBuilding).toHaveBeenCalledWith(body);
  });

  it('forwards both the id and the body when updating a facility', async () => {
    const body = {lighting: true} as never;

    await controller.updateBuilding('b1', body);

    expect(service.updateBuilding).toHaveBeenCalledWith('b1', body);
  });

  it('forwards the id when deleting a facility', async () => {
    await controller.deleteBuilding('b1');

    expect(service.deleteBuilding).toHaveBeenCalledWith('b1');
  });
});
