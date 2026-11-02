import {SetMetadata} from '@nestjs/common';
import {TUserRole} from '@models/user.model';

const ROLES_KEY = 'roles';

/**
 * Declares which roles may reach a route. Read back by `RolesGuard`.
 *
 * A route with no `@Roles(...)` is not restricted by role — authentication alone
 * decides. The guard is therefore opt-in: adding it does not silently close
 * routes that were never meant to be role-gated.
 */
const Roles = (...roles: TUserRole[]) => SetMetadata(ROLES_KEY, roles);

export {Roles, ROLES_KEY};
