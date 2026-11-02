import {HttpException} from '@nestjs/common';
import {VerifiedCallback} from 'passport-jwt';
import {JwtStrategy} from './jwt.strategy';

/**
 * `validate` is what turns a decoded token into `request.user`, which `RolesGuard`
 * and `@CurrentUser` then read. The strategy is constructed with the real
 * `super()` call so the class under test is the production one; only the
 * `AuthorizationService` is stubbed, because the lookup it performs is the
 * boundary.
 */
describe('JwtStrategy.validate', () => {
  const user = {_id: 'user-1', email: 'ada@example.com', role: 'ADMIN'};
  let authService: {validateUser: jest.Mock};
  let strategy: JwtStrategy;
  let done: jest.Mock;

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    authService = {validateUser: jest.fn().mockResolvedValue(user)};
    strategy = new JwtStrategy(authService as never);
    done = jest.fn();
  });

  it('awaits the user before handing it to passport', async () => {
    await strategy.validate({_id: 'user-1', email: 'ada@example.com', role: 'ADMIN'}, done as VerifiedCallback);

    // Without `await` the second argument is a Promise, so `request.user` is a
    // Promise and both `RolesGuard` and `@CurrentUser` see nothing. This asserts
    // the resolved document, which is what they actually read.
    expect(done).toHaveBeenCalledWith(null, user, undefined);
    expect(done.mock.calls[0][1]).not.toBeInstanceOf(Promise);
  });

  it('resolves the user through the authorization service', async () => {
    const payload = {_id: 'user-1', email: 'ada@example.com', role: 'ADMIN' as const};
    await strategy.validate(payload, done as VerifiedCallback);

    expect(authService.validateUser).toHaveBeenCalledWith(payload);
  });

  it('passes the token issue time to passport', async () => {
    await strategy.validate({_id: 'user-1', email: 'ada@example.com', role: 'ADMIN', iat: 1234}, done as VerifiedCallback);

    expect(done).toHaveBeenCalledWith(null, user, 1234);
  });

  it('rejects a null payload with 401', async () => {
    await strategy.validate(null, done as VerifiedCallback);

    const [error] = done.mock.calls[0] as [HttpException];
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(401);
  });
});
