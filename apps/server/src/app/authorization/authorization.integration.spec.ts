import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {RolesGuard} from './guards/roles.guard';
import {Roles} from './decorators/roles.decorator';
import {CurrentUser} from './decorators/current-user.decorator';
import {TUserRole} from '@models/user.model';

/**
 * Exercises the authorisation primitives over a real HTTP round-trip: a real Nest
 * application, a real router, real guard execution and a real 403 response body.
 *
 * Authentication is replaced by a header-driven stand-in, because the point here
 * is the *authorisation* layer. The stand-in sets `request.user` exactly the way
 * `AuthGuard('jwt')` does after `JwtStrategy.validate` resolves, so `RolesGuard`
 * and `@CurrentUser` run against the same shape they see in production.
 *
 * An unauthenticated request throws `UnauthorizedException` rather than returning
 * `false`, because that is what `AuthGuard('jwt')` does. Returning `false` would
 * make Nest answer `403`, which would let this suite pass while the real
 * unauthenticated answer (`401`) was wrong.
 */
@Injectable()
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{headers: Record<string, string>; user?: unknown}>();
    const role = request.headers['x-test-role'];
    if (!role) {
      throw new UnauthorizedException('Unauthorized');
    }
    request.user = {_id: request.headers['x-test-id'] ?? 'user-1', email: 'ada@example.com', role: role as TUserRole};
    return true;
  }
}

@Controller('probe')
@UseGuards(StubAuthGuard, RolesGuard)
class ProbeController {
  @Get('any')
  any() {
    return {ok: true};
  }

  @Get('admin')
  @Roles('ADMIN')
  adminOnly(@CurrentUser() user: {role?: TUserRole}) {
    return {ok: true, role: user?.role};
  }

  @Get('staff')
  @Roles('ADMIN', 'OFFICE', 'EMPLOYEE')
  staffOnly() {
    return {ok: true};
  }
}

@Module({
  controllers: [ProbeController],
  providers: [RolesGuard],
})
class ProbeModule {}

describe('authorisation over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(ProbeModule, {logger: false});
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, {headers});

  it('allows an authenticated caller through a route with no role restriction', async () => {
    const response = await get('/probe/any', {'x-test-role': 'EMPLOYEE'});
    expect(response.status).toBe(200);
  });

  it('returns 401, not 403, for an unauthenticated caller', async () => {
    const response = await get('/probe/admin');
    expect(response.status).toBe(401);
  });

  it('returns 403 for an authenticated employee on an administrator-only route', async () => {
    const response = await get('/probe/admin', {'x-test-role': 'EMPLOYEE'});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({message: 'Insufficient role'});
  });

  it('allows an administrator onto an administrator-only route', async () => {
    const response = await get('/probe/admin', {'x-test-role': 'ADMIN'});
    expect(response.status).toBe(200);
  });

  it('injects the authenticated user through @CurrentUser', async () => {
    const response = await get('/probe/admin', {'x-test-role': 'ADMIN'});
    await expect(response.json()).resolves.toMatchObject({role: 'ADMIN'});
  });

  it('allows every staff role onto a route that lists them', async () => {
    for (const role of ['ADMIN', 'OFFICE', 'EMPLOYEE']) {
      const response = await get('/probe/staff', {'x-test-role': role});
      expect(response.status).toBe(200);
    }
  });
});
