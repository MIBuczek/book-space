import {Test, TestingModule} from '@nestjs/testing';
import {StructuredLogger} from '../../logging/structured-logger';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {AuthorizationService} from './authorization.service';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  // The service depends on a Mongoose model. The generated spec provided neither the
  // model token nor a JwtService, so Nest could not resolve the provider and every
  // assertion failed. Stub both so the unit under test can be constructed.
  const modelMock = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {provide: getModelToken('User'), useValue: modelMock},
        {provide: StructuredLogger, useValue: {log: jest.fn(), warn: jest.fn(), error: jest.fn()}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}}
      ]
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
