/**
 * The public tenant identity (FR-007, contracts/tenant.md).
 *
 * These are the values that used to be the previous tenant's brand compiled into the UI. They
 * now come from the server's configuration, so rebranding a deployment is a settings change and
 * not a rebuild, and the shipped product carries no tenant's name, address or URL.
 *
 * A `null` field is a value the deployment has not set. The UI **hides** the element rather than
 * rendering an empty link or a broken `mailto:` (SC-005), which is why every field except the
 * name is nullable rather than optional — the shape is stable and the absence is explicit.
 *
 * The staff inbox (`TENANT_STAFF_EMAIL`) is deliberately **not** here: it is server-only, because
 * it is an operational address the public page must not publish.
 */
interface ITenant {
  name: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  privacyUrl: string | null;
}

/**
 * The name a deployment shows when `TENANT_NAME` is not configured.
 *
 * The product name, not a tenant's: an unconfigured deployment still renders and still signs its
 * mail, rather than showing a blank brand (SC-005). It lives here rather than in the notification
 * templates so the footer the UI renders and the signature the server sends read the same
 * constant — the two would otherwise be free to disagree.
 */
const DEFAULT_TENANT_NAME = 'Book Space';

export {DEFAULT_TENANT_NAME};
export type {ITenant};
