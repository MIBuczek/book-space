# Contract: Deployment and Configuration

The contract between the running application and its Azure environment. It names **what each app
needs**, **where it comes from**, and **what must never happen**. The images are already
environment-driven (`apps/server/Dockerfile`, `apps/ui/Dockerfile`), so this contract is the
existing one, made explicit and extended for Cosmos and ServiceNow.

## 1. Images

| Image | Built from | Runs | Listens |
|-------|-----------|------|---------|
| `book-space-server` | `apps/server/Dockerfile` | the NestJS bundle (`node dist/apps/server/main.js`) | 3000 |
| `book-space-ui` | `apps/ui/Dockerfile` | nginx serving the Angular bundle and proxying `/api` | 80 |

Both Dockerfiles are unchanged. The build context must carry **full git history**
(`git rev-list --count HEAD` stamps the version), so a shallow clone fails the build loudly.

## 2. Registry

- Images live in **Azure Container Registry**.
- Tags: `:<git-sha>` (immutable, the deploy target) and `:main` (moving convenience).
- The App Services pull with a **managed identity** holding `AcrPull` (no registry password in a
  workflow — research R7).

## 3. Server app settings (App Service configuration)

Required:

| Setting | Notes |
|---------|-------|
| `DB_URI` | The **Cosmos DB for MongoDB** connection string (`mongodb://…@<acct>.mongo.cosmos.azure.com:10255/…` or the vCore equivalent). Must match `/^mongodb(\+srv)?:\/\//` (`env.validation.ts`). |
| `JWT_SECRET` | ≥ 32 characters; validated at boot. |

Optional (each unset disables the feature rather than breaking boot):

| Setting | Notes |
|---------|-------|
| `SEED_REFERENCE_DATA` | Exact string `true` to seed the twelve facilities; anything else leaves it off. |
| `SUMMARY_DENY_LIST` | Comma-separated accounts denied the Summary tab. |
| `MAIL_ENDPOINT`, `MAIL_API_KEY`, `MAIL_FROM` | Outbound mail; unset means a visible `502`. |
| `SISK_CONTACT_EMAIL` | The SISK inbox for notifications. |
| `PUBLIC_RATE_LIMIT`, `PUBLIC_RATE_LIMIT_WINDOW_MS`, `NOTIFICATION_QUOTA`, `NOTIFICATION_QUOTA_WINDOW_MS` | Abuse protection. |
| `SERVICENOW_ENDPOINT`, `SERVICENOW_TABLE`, `SERVICENOW_USER`, `SERVICENOW_PASSWORD`, `SERVICENOW_TOKEN`, `SERVICENOW_TIMEOUT_MS` | ServiceNow integration (see `contracts/servicenow.md`). |

Rules:

- **No secret is baked into an image.** Credentials are app settings, ideally **Key Vault
  references** (`@Microsoft.KeyVault(...)`).
- **No environment-specific value in the image.** The same image runs in every environment.
- Rotating a credential is an app-setting update (and a restart), never a rebuild.

## 4. UI app settings

| Setting | Notes |
|---------|-------|
| `API_UPSTREAM` | The API origin nginx proxies `/api/` to (substituted into `nginx.conf.template` at start). |

The UI issues **relative** `/api` requests, so the deployment needs **no CORS exception** and the
bundle is not tied to a host name (FR-011). If the UI and API are ever served from different
origins, the proxy (or a gateway) must keep `/api` same-origin; adding CORS instead is a deviation
to be recorded.

## 5. Cosmos DB

- **API**: MongoDB API (`*.mongo.cosmos.azure.com`), so `DB_URI` and the driver are unchanged
  (research R1).
- **Tier**: decided by the Phase 0 spike (vCore recommended — research R5).
- **Database**: `book_space`; collections `users`, `clients`, `buildings`, `bookings`
  (`bookedTimes` embedded).
- **Collections and unique indexes are created while empty**, before any seed or migration write
  (research R2; `infra/scripts/ensure-collections.ts`).
- **Sharding**: off by default. A sharded collection makes every unique index compound with the
  shard key, which would change the `{city, property}` index; the data volume does not require it.
- **Transactions**: none cross a collection boundary (research R4).

## 6. Release contract

- `ci.yml` (lint, unit tests, build, secret scan) is the **merge gate**, unchanged.
- `release.yml` runs on `push: main` only. It builds → pushes to ACR → updates both App Services
  to the new SHA tag.
- Azure authentication is **OIDC** (federated identity); **no Azure secret is stored** (FR-005,
  research R6).
- **Rollback** = re-deploy the previous SHA tag to both apps (SC-006).
- A failed build stops the workflow **before** any app is updated, so a release is all-or-nothing.

## 7. Non-negotiable invariants

1. No credential in the client bundle (`SC-007`; CI's `scan-bundle.js`).
2. No credential committed to the repository (`scan-secrets.js`).
3. No long-lived Azure credential in GitHub.
4. The legacy Firebase project stays intact until reconciliation passes (Constitution V).
