import {Test, TestingModule} from '@nestjs/testing';
import {getModelToken} from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import {UserService} from './user.service';

/**
 * The password-hashing defect is the reason this spec is not a `toBeDefined()`
 * stub: `updateUser` used `updateOne`, which does not run the `pre('save')` hook,
 * so an updated password was stored in plaintext. The assertions here are on
 * *what reaches the driver* — a bcrypt hash, never the plaintext — because a test
 * that asserts on a mocked call shape cannot catch that class of defect.
 */
describe('UserService', () => {
  let service: UserService;
  let model: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
    countDocuments: jest.Mock;
  };

  beforeEach(async () => {
    model = {
      create: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({matchedCount: 1, modifiedCount: 1}),
      deleteOne: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService, {provide: getModelToken('User'), useValue: model}],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('findAllUser', () => {
    it('never returns a password field', async () => {
      model.find.mockResolvedValue([
        {toJSON: () => ({_id: 'user-1', email: 'a@example.com', password: 'hash-1'})},
        {toJSON: () => ({_id: 'user-2', email: 'b@example.com', password: 'hash-2'})},
      ]);

      const result = await service.findAllUser();

      expect(result).toHaveLength(2);
      for (const user of result) {
        expect(user).not.toHaveProperty('password');
      }
    });
  });

  describe('findUser', () => {
    it('never returns a password field', async () => {
      model.findOne.mockResolvedValue({toJSON: () => ({_id: 'user-1', email: 'a@example.com', password: 'hash'})});

      const result = await service.findUser('user-1');

      expect(result).not.toHaveProperty('password');
    });

    it('returns null when the user does not exist', async () => {
      model.findOne.mockResolvedValue(null);

      await expect(service.findUser('missing')).resolves.toBeNull();
    });
  });

  describe('updateUser', () => {
    it('stores a bcrypt hash when the password is updated, never the plaintext', async () => {
      await service.updateUser('user-1', {password: 'a new secret', recheckPassword: 'a new secret'} as never);

      const [, update] = model.updateOne.mock.calls[0] as [unknown, Record<string, string>];
      expect(update.password).not.toBe('a new secret');
      expect(update.password).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare('a new secret', update.password)).resolves.toBe(true);
    });

    it('requires the confirmation when the password is being changed', async () => {
      await expect(service.updateUser('user-1', {password: 'a new secret'} as never)).rejects.toThrow(/password/i);

      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('does not send the password confirmation to the driver', async () => {
      await service.updateUser('user-1', {password: 'a new secret', recheckPassword: 'a new secret'} as never);

      const [, update] = model.updateOne.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(update).not.toHaveProperty('recheckPassword');
    });

    it('does not touch the password when it is absent', async () => {
      await service.updateUser('user-1', {firstName: 'Grace'} as never);

      const [, update] = model.updateOne.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(update).toEqual({firstName: 'Grace'});
    });

    it('rejects a mismatched confirmation before touching the database', async () => {
      await expect(
        service.updateUser('user-1', {password: 'a new secret', recheckPassword: 'different'} as never)
      ).rejects.toThrow(/password/i);

      expect(model.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    it('never returns a password field', async () => {
      model.create.mockResolvedValue({
        toJSON: () => ({_id: 'user-1', email: 'a@example.com', password: 'hash'}),
      });

      const result = await service.createUser({} as never);

      expect(result).not.toHaveProperty('password');
    });
  });

  describe('deleteUser', () => {
    it('deletes by id', async () => {
      model.deleteOne.mockResolvedValue({deletedCount: 1});

      await service.deleteUser('user-1');

      expect(model.deleteOne).toHaveBeenCalledWith({_id: 'user-1'});
    });
  });

  describe('error handling', () => {
    // The error filter reads the status off the exception. A plain Error passed
    // through would become a 500 and, before the filter was fixed, a 200; so the
    // service is asserted to wrap driver failures in an HttpException.
    it('turns a driver failure on read into an HttpException', async () => {
      model.find.mockRejectedValue(new Error('connection lost'));

      await expect(service.findAllUser()).rejects.toMatchObject({status: 500, message: 'connection lost'});
    });

    it('turns a driver failure on a single read into an HttpException', async () => {
      model.findOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.findUser('user-1')).rejects.toMatchObject({status: 500});
    });

    it('turns a driver failure on create into an HttpException', async () => {
      model.create.mockRejectedValue(new Error('duplicate key'));

      await expect(service.createUser({} as never)).rejects.toMatchObject({status: 500});
    });

    it('turns a driver failure on update into an HttpException', async () => {
      model.updateOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.updateUser('user-1', {firstName: 'Grace'} as never)).rejects.toMatchObject({status: 500});
    });

    it('turns a driver failure on delete into an HttpException', async () => {
      model.deleteOne.mockRejectedValue(new Error('connection lost'));

      await expect(service.deleteUser('user-1')).rejects.toMatchObject({status: 500});
    });
  });
});
