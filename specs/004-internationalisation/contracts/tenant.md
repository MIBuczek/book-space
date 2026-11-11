# Contract: Tenant Configuration

The contract that replaces the hardcoded SISK brand. It names every value that used to be SISK,
where it comes from now, and what an unconfigured deployment renders.

## 1. Server settings

Validated in `apps/server/src/app/config/env.validation.ts` (optional strings, like `MAIL_*`), so
an unset value disables a feature rather than breaking boot.

| Setting | Purpose | Default | Required when |
|---------|---------|---------|---------------|
| `TENANT_NAME` | the brand in the footer, the meta line and the e-mail signature | `Book Space` | never |
| `TENANT_CONTACT_EMAIL` | the address the contact page shows | unset | never (the field hides) |
| `TENANT_WEBSITE_URL` | the footer's site link | unset | never (the link hides) |
| `TENANT_PRIVACY_URL` | the footer's privacy-policy link | unset | never (the link hides) |
| `TENANT_STAFF_EMAIL` | the inbox staff notifications and contact-form messages are delivered to (was `SISK_CONTACT_EMAIL`) | unset | the staff/contact notification path |

The rename `SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL` is part of FR-011 (English, unbranded
naming). A deployment sets the new name; the old name is **not** read (a silent fallback would
keep the brand alive in configuration).

## 2. The public subset

`GET /api/tenant` (public, no credential — the footer and the contact page are public):

```ts
interface ITenant {
  name: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  privacyUrl: string | null;
}
```

- The type lives in `libs/models/tenant.model.ts` (Principle IV: shared types in `libs/models`).
- A `null` field is a value the deployment has not set; the UI **hides** the element rather than
  rendering an empty link or a broken `mailto:` (SC-005).
- The endpoint is public and returns **no** staff inbox and **no** deny-list.

## 3. What the UI does with it

| Element | Source | Absent behaviour |
|---------|--------|------------------|
| Footer brand line | `translate('footer.site', {tenant: tenant.name})` | falls back to the product name |
| Footer site link | `tenant.websiteUrl` | link hidden |
| Footer privacy link | `tenant.privacyUrl` | link hidden |
| Contact page address | `tenant.contactEmail` | the field is hidden |
| E-mail signature (server) | `TENANT_NAME` | the product name |

## 4. The facility seed

- The twelve facilities are **sample data** and stay as they are (decision 5); they carry no
  SISK brand. A tenant may replace them through the seed.
- The seed keeps its idempotent upsert (`ReferenceDataService`), so a rebranded seed is applied on
  the next `SEED_REFERENCE_DATA=true` run and does not fight an administrator's edits otherwise.
- The default (no tenant input) is **neutral sample data** with no real address and no
  `@gmail.com` facility address, so the repository ships no personal data.

## 5. The deny-list

- `apps/server/src/app/reporting/deny-list.ts` no longer defaults to a person's address. An unset
  `SUMMARY_DENY_LIST` denies **nobody**.
- This is a behaviour change (a fresh deployment denied one account before); it is recorded in the
  feature's tasks and in `AGENTS.md`.

## 6. Non-negotiable invariants

1. **No SISK value in the product.** The built UI bundle and the server source contain no
   `sisk`/`siechnice` (SC-002). Documentation provenance is exempt (decision 3); the facility
   sample data is exempt (decision 5).
2. **No secret in the bundle.** The tenant values are public contact details; the staff inbox and
   the deny-list stay server-side.
3. **A neutral default renders.** With no tenant configuration the app boots and renders the
   product name and no municipal links (SC-005).
4. **Rebranding needs no rebuild.** A deployment changes settings; the bundle is unchanged.
