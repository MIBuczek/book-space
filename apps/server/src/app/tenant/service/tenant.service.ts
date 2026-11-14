import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {DEFAULT_TENANT_NAME, ITenant} from '@models/tenant.model';

/**
 * The tenant identity the UI renders (FR-007, contracts/tenant.md).
 *
 * The values are the deployment's settings, not compiled-in constants, so rebranding is a
 * configuration change and the shipped bundle carries no tenant's name or address.
 *
 * Two rules make the response safe to publish:
 *
 * - **An unset value is `null`, not an empty string.** The UI hides the element on `null`; an
 *   empty string would render a link with no destination or a `mailto:` with no address, which
 *   looks like a working control and is not (SC-005). A blank setting is treated the same as an
 *   absent one, because an operator who writes `TENANT_WEBSITE_URL=` means "no site", not "the
 *   empty site".
 * - **The staff inbox never crosses.** `TENANT_STAFF_EMAIL` is an operational address and stays
 *   server-side, so this service does not read it at all.
 */
@Injectable()
export class TenantService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * The public subset. The name always resolves, because the fallback is the product name.
   */
  getTenant(): ITenant {
    return {
      name: this.setting('TENANT_NAME') ?? DEFAULT_TENANT_NAME,
      contactEmail: this.setting('TENANT_CONTACT_EMAIL'),
      websiteUrl: this.setting('TENANT_WEBSITE_URL'),
      privacyUrl: this.setting('TENANT_PRIVACY_URL'),
    };
  }

  /** A configured value, or `null` when it is absent or blank. */
  private setting(name: string): string | null {
    const value = this.configService.get<string>(name);
    return value ? value : null;
  }
}
