import {Controller, Get} from '@nestjs/common';
import {ITenant} from '@models/tenant.model';
import {TenantService} from '../service/tenant.service';

/**
 * The tenant identity, public (FR-007, contracts/tenant.md).
 *
 * The footer and the contact page render these values on every page, including the pages an
 * anonymous visitor sees, so the route carries no guard. It publishes only the public subset —
 * the name, the contact address and the two URLs — and never the staff inbox.
 */
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  getTenant(): ITenant {
    return this.tenantService.getTenant();
  }
}
