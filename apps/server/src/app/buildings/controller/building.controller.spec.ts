import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {Request} from 'express';
import {BuildingController} from './building.controller';
import {BuildingService} from '../service/building.service';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';

/**
 * The controller is a thin pass-through to the service, so these tests assert the
 * delegation rather than re-testing behaviour the service spec already covers. The service
 * is stubbed for that reason, and the assertions are on the arguments the controller
 * forwards — which is where a wrong parameter would show up.
 *
 * The list route's own behaviour — the staff/public response split — is asserted here
 * because it is a controller decision (the service returns the whole list either way); the
 * end-to-end shape is proven over HTTP in `building.integration.spec.ts`.
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

  /** A request as `OptionalJwtAuthGuard` leaves it; the controller reads `isPublic`. */
  const request = (isPublic: boolean) => ({isPublic} as Request);

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
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<BuildingController>(BuildingController);
  });

  it('lists facilities through the service', async () => {
    await controller.getAllBuildings(request(true), undefined);

    expect(service.findAllBuildings).toHaveBeenCalledTimes(1);
  });

  it('asks for retired facilities only for a staff caller (T059)', async () => {
    await controller.getAllBuildings(request(true), undefined);
    expect(service.findAllBuildings).toHaveBeenLastCalledWith(false);

    await controller.getAllBuildings(request(false), {role: 'ADMIN'});
    expect(service.findAllBuildings).toHaveBeenLastCalledWith(true);
  });

  it('returns the full record to a staff caller', async () => {
    service.findAllBuildings.mockResolvedValue([{_id: 'b1', email: 'a@b.pl', employees: ['Ada']}]);

    const result = await controller.getAllBuildings(request(false), {role: 'ADMIN'});

    expect(result).toEqual([{_id: 'b1', email: 'a@b.pl', employees: ['Ada']}]);
  });

  it('redacts the staff-only fields for a public caller', async () => {
    service.findAllBuildings.mockResolvedValue([
      {_id: 'b1', name: 'Hala', city: 'siechnice', email: 'a@b.pl', phone: '123', employees: ['Ada']},
    ]);

    const result = (await controller.getAllBuildings(request(true), undefined)) as Array<
      Record<string, unknown>
    >;

    expect(result[0]).toMatchObject({_id: 'b1', name: 'Hala', city: 'siechnice'});
    expect(result[0]).not.toHaveProperty('email');
    expect(result[0]).not.toHaveProperty('employees');
  });

  it('treats an authenticated request with no recognised role as public', async () => {
    service.findAllBuildings.mockResolvedValue([{_id: 'b1', email: 'a@b.pl'}]);

    const result = (await controller.getAllBuildings(request(false), {role: undefined})) as Array<
      Record<string, unknown>
    >;

    expect(result[0]).not.toHaveProperty('email');
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
