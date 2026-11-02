import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {UsersController} from './users.controller';
import {UserService} from '../service/user.service';

/**
 * The controller is a thin pass-through to the service, so these tests assert the
 * delegation rather than re-testing behaviour the service spec already covers. The
 * service is stubbed for that reason, and the assertions are on the arguments the
 * controller forwards — which is where a wrong parameter would show up.
 */
describe('UsersController', () => {
  let controller: UsersController;
  let service: {
    findAllUser: jest.Mock;
    findUser: jest.Mock;
    createUser: jest.Mock;
    updateUser: jest.Mock;
    deleteUser: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAllUser: jest.fn().mockResolvedValue([]),
      findUser: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({}),
      updateUser: jest.fn().mockResolvedValue({matchedCount: 1}),
      deleteUser: jest.fn().mockResolvedValue({deletedCount: 1}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {provide: UserService, useValue: service},
        {provide: getModelToken('User'), useValue: {}},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('lists users through the service', async () => {
    await controller.getAllUsers();

    expect(service.findAllUser).toHaveBeenCalledTimes(1);
  });

  it('forwards the id when reading one user', async () => {
    await controller.getSingleUser('user-1');

    expect(service.findUser).toHaveBeenCalledWith('user-1');
  });

  it('forwards the body when creating a user', async () => {
    const body = {firstName: 'Ada', role: 'ADMIN'} as never;

    await controller.createUser(body);

    expect(service.createUser).toHaveBeenCalledWith(body);
  });

  it('forwards both the id and the body when updating a user', async () => {
    const body = {firstName: 'Grace'} as never;

    await controller.updateUser('user-1', body);

    expect(service.updateUser).toHaveBeenCalledWith('user-1', body);
  });

  it('forwards the id when deleting a user', async () => {
    await controller.deleteUser('user-1');

    expect(service.deleteUser).toHaveBeenCalledWith('user-1');
  });
});
