import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {UsersController} from './users.controller';
import {UserService} from '../service/user.service';

describe('UsersController', () => {
  let controller: UsersController;

  // The controller is constructed with its service injected, and the routes are
  // guarded by AuthGuard('jwt'). Neither was provided by the generated spec, so
  // Nest could not resolve the dependency graph.
  const depMock = {};
  const modelMock = {create: jest.fn(), find: jest.fn(), findOne: jest.fn()};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {provide: UserService, useValue: depMock},
        {provide: getModelToken('User'), useValue: modelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
