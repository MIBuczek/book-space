import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {BookingController} from './booking.controller';
import {BookingService} from '../service/booking.service';

describe('BookingController', () => {
  let controller: BookingController;

  // The controller is constructed with its service injected, and the routes are
  // guarded by AuthGuard('jwt'). Neither was provided by the generated spec, so
  // Nest could not resolve the dependency graph.
  const depMock = {};
  const modelMock = {create: jest.fn(), find: jest.fn(), findOne: jest.fn()};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        {provide: BookingService, useValue: depMock},
        {provide: getModelToken('User'), useValue: modelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<BookingController>(BookingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
