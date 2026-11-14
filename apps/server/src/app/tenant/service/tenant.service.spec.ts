import {Test, TestingModule} from '@nestjs/testing';
import {ConfigService} from '@nestjs/config';
import {DEFAULT_TENANT_NAME} from '@models/tenant.model';
import {TenantService} from './tenant.service';

/**
 * The service is the boundary that decides what a deployment publishes, so the tests drive the
 * real service with a stubbed `ConfigService` and assert the *shape* it returns — the neutral
 * fallback, the `null` for an absent or blank setting, and the fact that the staff inbox never
 * appears in the response.
 */
describe('TenantService', () => {
  const configMock = {get: jest.fn()};
  let service: TenantService;

  const configure = (values: Record<string, string | undefined>) => {
    configMock.get.mockImplementation((key: string) => values[key]);
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantService, {provide: ConfigService, useValue: configMock}],
    }).compile();
    service = module.get(TenantService);
  });

  it('falls back to the product name when TENANT_NAME is unset', () => {
    configure({});
    expect(service.getTenant().name).toBe(DEFAULT_TENANT_NAME);
  });

  it('publishes the configured name and contact details', () => {
    configure({
      TENANT_NAME: 'Example Sports',
      TENANT_CONTACT_EMAIL: 'office@example.com',
      TENANT_WEBSITE_URL: 'https://example.com',
      TENANT_PRIVACY_URL: 'https://example.com/privacy',
    });
    expect(service.getTenant()).toEqual({
      name: 'Example Sports',
      contactEmail: 'office@example.com',
      websiteUrl: 'https://example.com',
      privacyUrl: 'https://example.com/privacy',
    });
  });

  // An unset value must be `null`, not `''`: the UI hides the element on `null`, and an empty
  // string would render a link with no destination that looks like a working control.
  it('answers null for an absent setting', () => {
    configure({TENANT_NAME: 'Example Sports'});
    expect(service.getTenant()).toEqual({
      name: 'Example Sports',
      contactEmail: null,
      websiteUrl: null,
      privacyUrl: null,
    });
  });

  // An operator who writes `TENANT_WEBSITE_URL=` means "no site", not "the empty site".
  it('treats a blank setting as absent', () => {
    configure({TENANT_CONTACT_EMAIL: '', TENANT_WEBSITE_URL: '', TENANT_PRIVACY_URL: ''});
    const tenant = service.getTenant();
    expect(tenant.contactEmail).toBeNull();
    expect(tenant.websiteUrl).toBeNull();
    expect(tenant.privacyUrl).toBeNull();
  });

  // The staff inbox is an operational address; the public response must not carry it.
  it('never reads the staff inbox', () => {
    configure({TENANT_STAFF_EMAIL: 'staff@example.com'});
    const tenant = service.getTenant();
    expect(Object.keys(tenant).sort()).toEqual(['contactEmail', 'name', 'privacyUrl', 'websiteUrl']);
    expect(JSON.stringify(tenant)).not.toContain('staff@example.com');
  });
});
