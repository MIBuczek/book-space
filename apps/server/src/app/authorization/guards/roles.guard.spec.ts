import {ExecutionContext, ForbiddenException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {RolesGuard} from './roles.guard';
import {ROLES_KEY} from '../decorators/roles.decorator';
import {TUserRole} from '@models/user.model';

interface IRequest {
  user?: {role?: TUserRole};
}

/**
 * Builds the two inputs the guard actually reads — the metadata for the handler
 * and the request — and nothing else. The guard is the unit under test, so the
 * reflector is the real class with a stubbed `getAllAndOverride`, which is the
 * extension point Nest provides.
 */
const contextFor = (user?: IRequest['user']): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({getRequest: (): IRequest => ({user})}),
  }) as unknown as ExecutionContext;

const reflectorFor = (roles: TUserRole[] | undefined): Reflector =>
  ({getAllAndOverride: (key: string) => (key === ROLES_KEY ? roles : undefined)}) as unknown as Reflector;

describe('RolesGuard', () => {
  it('allows a route with no @Roles metadata', () => {
    const guard = new RolesGuard(reflectorFor(undefined));
    expect(guard.canActivate(contextFor({role: 'EMPLOYEE'}))).toBe(true);
  });

  it('allows a caller whose role is listed', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN', 'OFFICE']));
    expect(guard.canActivate(contextFor({role: 'OFFICE'}))).toBe(true);
  });

  it('refuses a caller whose role is not listed', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(() => guard.canActivate(contextFor({role: 'EMPLOYEE'}))).toThrow(ForbiddenException);
  });

  it('refuses a caller with no role at all', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });

  it('refuses rather than allows when the role is not in the matrix', () => {
    // A role string the server does not know must not be treated as permitted.
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(() => guard.canActivate(contextFor({role: 'SUPERUSER' as TUserRole}))).toThrow(ForbiddenException);
  });

  it('returns 403, not 401, for an authenticated but unpermitted caller', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    try {
      guard.canActivate(contextFor({role: 'EMPLOYEE'}));
      throw new Error('expected the guard to refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getStatus()).toBe(403);
    }
  });
});
