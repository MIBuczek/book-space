import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {TUserRole} from '@models/user.model';
import {ROLES_KEY} from '../decorators/roles.decorator';

interface IRequestWithUser {
  user?: {role?: TUserRole};
}

/**
 * Enforces `@Roles(...)`. Authentication is a separate concern (`AuthGuard('jwt')`);
 * this guard answers only "may this caller reach this route", and refuses with
 * `403` so an authenticated caller is distinguishable from an unauthenticated one
 * (`401`), which is what the contract requires.
 *
 * A route with no `@Roles(...)` metadata is allowed through: the guard restricts
 * only what it was told to restrict.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<TUserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const {user} = context.switchToHttp().getRequest<IRequestWithUser>();
    const role = user?.role;

    // An unknown role is refused rather than allowed: `required.includes` on its own
    // would let a role the server does not recognise through if it were ever listed.
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
