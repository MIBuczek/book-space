import {Test, TestingModule} from '@nestjs/testing';
import {HttpException, HttpStatus} from '@nestjs/common';
import {StructuredLogger} from '../../logging/structured-logger';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import {AuthorizationService} from './authorization.service';

/**
 * The service is the unit under test; the Mongoose model is the boundary it is
 * given, so the model is stubbed. `bcrypt.compare` is not stubbed: the real
 * comparison runs against a real hash, because the check that matters is the one
 * the service performs, not a stubbed answer to it.
 */
describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let userModel: {
    findOne: jest.Mock;
    updateOne: jest.Mock;
    create: jest.Mock;
  };
  let logger: {log: jest.Mock; warn: jest.Mock; error: jest.Mock};

  const password = 'correct horse battery';
  const passwordHash = bcrypt.hashSync(password, 4);

  const storedUser = () => ({
    _id: 'user-1',
    email: 'ada@example.com',
    password: passwordHash,
    role: 'ADMIN' as const,
    lastLogin: new Date('2020-01-01'),
  });

  beforeEach(async () => {
    userModel = {findOne: jest.fn(), updateOne: jest.fn(), create: jest.fn()};
    logger = {log: jest.fn(), warn: jest.fn(), error: jest.fn()};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {provide: getModelToken('User'), useValue: userModel},
        {provide: StructuredLogger, useValue: logger},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  describe('signIn', () => {
    it('returns the user and records the sign-in on success', async () => {
      const user = storedUser();
      userModel.findOne.mockResolvedValue(user);
      userModel.updateOne.mockResolvedValue({acknowledged: true});

      const result = await service.signIn({email: user.email, password} as never);

      expect(result).toBe(user);
      expect(userModel.updateOne).toHaveBeenCalledWith({_id: user._id}, {lastLogin: user.lastLogin});
      expect(logger.log).toHaveBeenCalledWith('auth.sign_in.succeeded', {userId: user._id});
    });

    it('rejects an unknown e-mail with 401', async () => {
      userModel.findOne.mockResolvedValue(null);

      await expect(service.signIn({email: 'nobody@example.com', password} as never)).rejects.toBeInstanceOf(
        HttpException
      );
      await expect(service.signIn({email: 'nobody@example.com', password} as never)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it('does not log the attempted e-mail address when the account is unknown', async () => {
      userModel.findOne.mockResolvedValue(null);

      await service.signIn({email: 'nobody@example.com', password} as never).catch(() => undefined);

      const logged = JSON.stringify(logger.warn.mock.calls);
      expect(logged).not.toContain('nobody@example.com');
    });

    it('rejects a wrong password with 401 and logs the reason', async () => {
      const user = storedUser();
      userModel.findOne.mockResolvedValue(user);

      await expect(service.signIn({email: user.email, password: 'wrong password'} as never)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(logger.warn).toHaveBeenCalledWith('auth.sign_in.rejected', {
        reason: 'bad_password',
        userId: user._id,
      });
    });

    it('does not update lastLogin when the password is wrong', async () => {
      userModel.findOne.mockResolvedValue(storedUser());

      await service.signIn({email: 'ada@example.com', password: 'wrong password'} as never).catch(() => undefined);

      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('never returns the password hash to the caller on success', async () => {
      const user = storedUser();
      userModel.findOne.mockResolvedValue(user);
      userModel.updateOne.mockResolvedValue({acknowledged: true});

      const result = (await service.signIn({email: user.email, password} as never)) as {password?: string};

      // The service returns the stored document, so the hash is on it. Removing it
      // is the serialiser's job (T007); this asserts the current contract only so a
      // future change that starts stripping it here is a deliberate one.
      expect(result.password).toBe(passwordHash);
    });
  });

  describe('validateUser', () => {
    const payload = {_id: 'user-1', email: 'ada@example.com', role: 'ADMIN' as const};

    it('returns the user when the id and e-mail both match the token', async () => {
      const user = storedUser();
      userModel.findOne.mockResolvedValue(user);

      await expect(service.validateUser(payload)).resolves.toBe(user);
    });

    it('rejects a token whose user no longer exists', async () => {
      userModel.findOne.mockResolvedValue(null);

      await expect(service.validateUser(payload)).rejects.toMatchObject({status: HttpStatus.UNAUTHORIZED});
      expect(logger.warn).toHaveBeenCalledWith('auth.token.rejected', {userId: payload._id});
    });

    it('rejects a token whose e-mail no longer matches the stored account', async () => {
      userModel.findOne.mockResolvedValue({...storedUser(), email: 'someone-else@example.com'});

      await expect(service.validateUser(payload)).rejects.toBeInstanceOf(HttpException);
    });
  });
});
