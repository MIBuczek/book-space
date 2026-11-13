import {createMongoTestContext, MongoTestContext} from '../../testing/mongo-test-context';

/**
 * Proves the public tenant route over real HTTP (FR-007, contracts/tenant.md).
 *
 * Two things a unit test of the service cannot show: that the route is reachable **without a
 * credential** — the footer renders on every public page — and that the response body carries no
 * staff inbox. The environment is set before the context is created, because `ConfigModule`
 * captures `process.env` when `AppModule` is imported; it is restored afterwards so the values
 * do not leak into another spec in the same worker.
 */
describe('tenant configuration over HTTP', () => {
  let ctx: MongoTestContext;
  const saved: Record<string, string | undefined> = {};

  const settings = {
    TENANT_NAME: 'Example Sports',
    TENANT_CONTACT_EMAIL: 'office@example.com',
    TENANT_WEBSITE_URL: 'https://example.com',
    TENANT_PRIVACY_URL: 'https://example.com/privacy',
    TENANT_STAFF_EMAIL: 'staff@example.com',
  };

  beforeAll(async () => {
    for (const [key, value] of Object.entries(settings)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    ctx = await createMongoTestContext();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    for (const key of Object.keys(settings)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('answers the public subset to an anonymous caller', async () => {
    const response = await fetch(`${ctx.baseUrl}/tenant`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: 'Example Sports',
      contactEmail: 'office@example.com',
      websiteUrl: 'https://example.com',
      privacyUrl: 'https://example.com/privacy',
    });
  });

  // The staff inbox is server-side only; a leak here would publish an operational address.
  it('never carries the staff inbox', async () => {
    const response = await fetch(`${ctx.baseUrl}/tenant`);
    const body = await response.text();

    expect(body).not.toContain('staff@example.com');
    expect(body).not.toContain('TENANT_STAFF_EMAIL');
  });
});
