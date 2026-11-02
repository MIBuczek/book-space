import {ExecutionContext, Injectable, UnauthorizedException} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';

/**
 * Authentication that does not require a credential.
 *
 * The public calendar and the staff calendar are the same resource seen at two
 * levels of detail, so they are one route rather than two. This guard runs the JWT
 * strategy when a token is present — leaving the full record on `request.user` — and
 * lets the request through without one when it is absent.
 *
 * A *bad* token is still refused. A malformed or expired token must not be
 * downgraded to an anonymous request, which would answer a caller whose session just
 * expired with a silently redacted calendar rather than a prompt to sign in again.
 * The presence of the header is what distinguishes "absent" from "invalid"; without
 * checking it, both arrive here as "no user".
 *
 * The request is marked so the response shape does not depend on the caller
 * happening to send an `Authorization` header: a controller reads `request.isPublic`
 * rather than inferring the caller's kind from `request.user`, because an
 * authenticated request that failed to attach a user would otherwise be served the
 * *full* record.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    const request = context
      .switchToHttp()
      .getRequest<{headers: Record<string, string | undefined>; isPublic?: boolean}>();

    if (err || !user) {
      if (hasBearerToken(request)) {
        throw new UnauthorizedException();
      }
      // No credential was presented, so this is the public case.
      request.isPublic = true;
      return undefined as TUser;
    }

    request.isPublic = false;
    return user;
  }
}

const hasBearerToken = (request: {headers: Record<string, string | undefined>}): boolean => {
  const header = request.headers?.authorization ?? request.headers?.Authorization;
  return typeof header === 'string' && header.trim().length > 0;
};

