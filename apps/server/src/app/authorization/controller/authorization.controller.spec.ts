import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {Response} from 'express';
import {AuthorizationController} from './authorization.controller';
import {AuthorizationService} from '../service/authorization.service';

/**
 * The controller's own behaviour is what is under test: it signs a token for the
 * user the service returns, and it clears the cookie on sign-out. The service is
 * stubbed because it is exercised by its own spec; the JWT service is stubbed so
 * the assertion is on the payload handed to it, not on a signed string.
 */
describe('AuthorizationController', () => {
  let controller: AuthorizationController;
  let service: {signIn: jest.Mock};
  let jwt: {signAsync: jest.Mock};

  const user = {
    _id: 'user-1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'ADMIN' as const,
  };

  beforeEach(async () => {
    service = {signIn: jest.fn()};
    jwt = {signAsync: jest.fn().mockResolvedValue('signed.jwt.token')};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationController],
      providers: [
        {provide: AuthorizationService, useValue: service},
        {provide: getModelToken('User'), useValue: {create: jest.fn(), find: jest.fn(), findOne: jest.fn()}},
        {provide: JwtService, useValue: jwt},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<AuthorizationController>(AuthorizationController);
  });

  it('returns the user and a token on sign-in', async () => {
    service.signIn.mockResolvedValue(user);

    const result = await controller.signIn({email: user.email, password: 'correct horse battery'} as never);

    expect(result).toEqual({user, token: 'signed.jwt.token'});
  });

  it('signs a payload carrying the id and e-mail', async () => {
    service.signIn.mockResolvedValue(user);

    await controller.signIn({email: user.email, password: 'correct horse battery'} as never);

    expect(jwt.signAsync).toHaveBeenCalledWith({email: user.email, _id: user._id});
  });

  it('clears the jwt cookie on sign-out', async () => {
    const cookie = jest.fn();
    const res = {cookie} as unknown as Response;

    await controller.signOut(res);

    // The controller writes an empty value with an expiry in the past, which is how
    // a cookie is cleared without depending on `clearCookie`'s path defaults.
    const [name, value, options] = cookie.mock.calls[0] as [string, string, {httpOnly: boolean; expires: Date}];
    expect(name).toBe('jwt');
    expect(value).toBe('');
    expect(options.httpOnly).toBe(true);
    expect(options.expires.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
