import {Module} from '@nestjs/common';
import {TenantController} from './controller/tenant.controller';
import {TenantService} from './service/tenant.service';

/**
 * The public tenant identity (FR-007). `ConfigModule` is global, so `ConfigService` is
 * injectable without importing it here.
 */
@Module({
  controllers: [TenantController],
  providers: [TenantService],
})
export class TenantModule {}
