import {createParamDecorator, ExecutionContext} from '@nestjs/common';
import {IActingUser} from '../ownership';

interface IRequestWithUser {
  user?: IActingUser;
}

/**
 * Reads the authenticated user off the request. Exported separately from the
 * decorator so the read can be tested without going through the framework's
 * parameter-resolution machinery, which the HTTP integration spec already covers.
 */
const readCurrentUser = (context: ExecutionContext): IActingUser | undefined =>
  context.switchToHttp().getRequest<IRequestWithUser>().user;

/**
 * Injects the authenticated user, which `AuthGuard('jwt')` puts on the request.
 *
 * Without this, a controller reads `@Req() req` and reaches into `req.user`,
 * which makes the dependency on authentication invisible in the signature. This
 * decorator is a thin read of the same value.
 */
const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): IActingUser | undefined =>
  readCurrentUser(context)
);

export {CurrentUser, readCurrentUser};
