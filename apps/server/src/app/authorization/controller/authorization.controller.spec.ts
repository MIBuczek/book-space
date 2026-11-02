import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {Response} from 'express';
import {AuthorizationController} from './authorization.controller';
import {AuthorizationService} from '../service/authorization.service';
import {serializeUser} from '../../users/models/user.serializer';
import {IUser} from '@models/user.model';
import {IActingUser} from '../ownership';

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

    expect(result).toEqual({user: serializeUser(user), token: 'signed.jwt.token'});
  });

  it('never returns the password hash', async () => {
    service.signIn.mockResolvedValue({...user, password: '$2b$10$abcdefghijklmnopqrstuv'});

    const result = await controller.signIn({email: user.email, password: 'correct horse battery'} as never);

    expect(result.user).not.toHaveProperty('password');
  });

  it('signs a payload carrying the id, e-mail and role', async () => {
    service.signIn.mockResolvedValue(user);

    await controller.signIn({email: user.email, password: 'correct horse battery'} as never);

    // The role is in the payload because `RolesGuard` reads it off `request.user`,
    // which `JwtStrategy` populates from this payload. A token without it would let
    // an administrator in but refuse every role-restricted route to everyone.
    expect(jwt.signAsync).toHaveBeenCalledWith({email: user.email, _id: user._id, role: 'ADMIN'});
  });

  it('takes the signed role from the stored user, not the request body', async () => {
    // The stored user is an EMPLOYEE while the body claims ADMIN. If the controller
    // signed the body's role, anyone could mint an administrator token by asking for
    // one, because `RolesGuard` trusts whatever the token says.
    service.signIn.mockResolvedValue({...user, role: 'EMPLOYEE'});

    await controller.signIn({email: user.email, password: 'correct horse battery', role: 'ADMIN'} as never);

    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({role: 'EMPLOYEE'}));
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

  it('acknowledges sign-out so a client can tell it succeeded', async () => {
    const res = {cookie: jest.fn()} as unknown as Response;

    await expect(controller.signOut(res)).resolves.toEqual({message: 'Signed out'});
  });

  describe('getMe', () => {
    it('serialises the acting user', () => {
      const acting = {...user, password: '$2b$10$abcdefghijklmnopqrstuv'};

      const result = controller.getMe(acting);

      expect(result).toEqual(serializeUser(acting));
    });

    it('never returns the password hash', () => {
      // `IUser` declares the hash, which is what a hydrated document carries; the
      // serialiser is what keeps it out of the response.
      const result = controller.getMe({...user, password: '$2b$10$abcdefghijklmnopqrstuv'} as IUser);

      expect(result).not.toHaveProperty('password');
    });

    it('returns null rather than throwing when no user is on the request', () => {
      // The guard should have refused first, so this is unreachable in production —
      // but returning null is the serialiser's contract, and a throw here would turn
      // a guard misconfiguration into a 500 instead of an obvious empty body.
      expect(controller.getMe(undefined as unknown as IActingUser)).toBeNull();
    });
  });
});
