import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {ClientController} from './client.controller';
import {ClientService} from '../service/client.service';

describe('ClientController', () => {
  let controller: ClientController;

  // The controller is constructed with its service injected, and the routes are
  // guarded by AuthGuard('jwt'). Neither was provided by the generated spec, so
  // Nest could not resolve the dependency graph.
  const depMock = {};
  const modelMock = {create: jest.fn(), find: jest.fn(), findOne: jest.fn()};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        {provide: ClientService, useValue: depMock},
        {provide: getModelToken('User'), useValue: modelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<ClientController>(ClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
