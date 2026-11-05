import {Test, TestingModule} from '@nestjs/testing';
import {JwtService} from '@nestjs/jwt';
import {ConfigService} from '@nestjs/config';
import {getModelToken} from '@nestjs/mongoose';
import {AuthGuard} from '@nestjs/passport';
import {Response} from 'express';
import {AuthorizationController} from './authorization.controller';
import {AuthorizationService} from '../service/authorization.service';
import {serializeUser} from '../../users/models/user.serializer';
import {capabilitiesFor} from '../capabilities';
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
  let config: {get: jest.Mock};

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
    // Unset deny-list by default, so the capabilities are the role's own. The
    // deny-list case is asserted on its own below.
    config = {get: jest.fn().mockReturnValue(undefined)};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationController],
      providers: [
        {provide: AuthorizationService, useValue: service},
        {provide: getModelToken('User'), useValue: {create: jest.fn(), find: jest.fn(), findOne: jest.fn()}},
        {provide: JwtService, useValue: jwt},
        {provide: ConfigService, useValue: config},
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({canActivate: () => true})
      .compile();

    controller = module.get<AuthorizationController>(AuthorizationController);
  });

  it('returns the user, its capabilities and a token on sign-in', async () => {
    service.signIn.mockResolvedValue(user);

    const result = await controller.signIn({email: user.email, password: 'correct horse battery'} as never);

    expect(result).toEqual({
      user: {...serializeUser(user), capabilities: capabilitiesFor('ADMIN', false)},
      token: 'signed.jwt.token',
    });
  });

  it('resolves the capabilities from the stored role, not the request body', async () => {
    // The body claims ADMIN; the stored user is an EMPLOYEE. If the capabilities came
    // from the body, a caller could make the menu offer tabs the API will refuse.
    service.signIn.mockResolvedValue({...user, role: 'EMPLOYEE' as const});

    const result = await controller.signIn({
      email: user.email,
      password: 'correct horse battery',
      role: 'ADMIN',
    } as never);

    expect(result.user.capabilities).toEqual(capabilitiesFor('EMPLOYEE', false));
  });

  it('denies the summary capability to a deny-listed account', async () => {
    config.get.mockReturnValue('mkulakowski@umsiechnice.pl');
    service.signIn.mockResolvedValue({...user, role: 'OFFICE' as const, email: 'mkulakowski@umsiechnice.pl'});

    const result = await controller.signIn({
      email: 'mkulakowski@umsiechnice.pl',
      password: 'correct horse battery',
    } as never);

    expect(result.user.capabilities.canSeeSummaryTab).toBe(false);
    // The deny-list is read from configuration, so the rest of the office capabilities
    // must survive it.
    expect(result.user.capabilities.canSeeClientsTab).toBe(true);
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
    service.signIn.mockResolvedValue({...user, role: 'EMPLOYEE' as const});

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
    it('serialises the acting user and adds its capabilities', () => {
      const acting = {...user, password: '$2b$10$abcdefghijklmnopqrstuv'};

      const result = controller.getMe(acting);

      expect(result).toEqual({
        ...serializeUser(acting),
        capabilities: capabilitiesFor('ADMIN', false),
      });
    });

    it('resolves the capabilities from the loaded account on each request', () => {
      // A role change between requests must reach `/auth/me` immediately; a response
      // built once at sign-in would go stale for the life of the token.
      const acting = {...user, role: 'OFFICE' as const};

      const result = controller.getMe(acting) as {capabilities: {canSeeSummaryTab: boolean}};

      expect(result.capabilities).toEqual(capabilitiesFor('OFFICE', false));
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
