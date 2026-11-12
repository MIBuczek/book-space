# Contract: Deployment and Configuration

The contract between the running application and its Azure environment. It names **what each app
needs**, **where it comes from**, and **what must never happen**. The images are already
environment-driven (`apps/server/Dockerfile`, `apps/ui/Dockerfile`), so this contract is the
existing one, made explicit and extended for Azure DocumentDB.

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
  workflow — research R8).

## 3. Server app settings (App Service configuration)

Required:

| Setting | Notes |
|---------|-------|
| `DB_URI` | The **Azure DocumentDB** connection string: `mongodb+srv://<user>:<pass>@<cluster>.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000`. Must match `/^mongodb(\+srv)?:\/\//` (`env.validation.ts`). |
| `JWT_SECRET` | ≥ 32 characters; validated at boot. |

Optional (each unset disables the feature rather than breaking boot):

| Setting | Notes |
|---------|-------|
| `SEED_REFERENCE_DATA` | Exact string `true` to seed the twelve facilities; anything else leaves it off. |
| `MAIL_ENDPOINT`, `MAIL_API_KEY`, `MAIL_FROM` | Outbound mail; unset means a visible `502`. |
| `SISK_CONTACT_EMAIL` | The SISK inbox for notifications. |
| `PUBLIC_RATE_LIMIT`, `PUBLIC_RATE_LIMIT_WINDOW_MS`, `NOTIFICATION_QUOTA`, `NOTIFICATION_QUOTA_WINDOW_MS` | Abuse protection. |

Rules:

- **No secret is baked into an image.** Credentials are app settings, ideally **Key Vault
  references** (`@Microsoft.KeyVault(...)`).
- **No environment-specific value in the image.** The same image runs in every environment.
- Rotating a credential is an app-setting update (and a restart), never a rebuild.

## 4. UI app settings

| Setting | Notes |
|---------|-------|
| `API_UPSTREAM` | The API origin nginx proxies `/api/` to. **This is the backend's private host name** (`https://app-book-space-api.azurewebsites.net`), resolved through the private DNS zone (see `contracts/network.md`). |

The UI issues **relative** `/api` requests, so the deployment needs **no CORS exception** and the
bundle is not tied to a host name (FR-010).

> Note: because the backend is private, the frontend must be able to resolve and reach it via VNet
> integration. If `API_UPSTREAM` were a public host name, the proxy would fail — this is the
> failure mode to check first if the UI loads but its data calls do not.

## 5. Database (Azure DocumentDB)

- **Service**: **Azure DocumentDB** — the MongoDB-compatible vCore service
  (`Microsoft.DocumentDB/mongoClusters`), wire protocol 5.0–8.0, so `DB_URI` and the driver are
  unchanged (research R1).
- **Database**: `book_space`; collections `users`, `clients`, `buildings`, `bookings`
  (`bookedTimes` embedded).
- **Indexes**: created by `infra/scripts/ensure-collections.ts` idempotently, before any seed or
  migration write (good practice; the tier does not require an empty collection — research R2).
- **Sharding**: off at this volume. The data does not require it (research R1).
- **Transactions**: none cross a collection boundary.
- **Network**: **private** — a private endpoint with public access disabled (research R3). The
  migration run therefore needs VNet access (research R11).
- **Connection string options**: the tier's string carries `retrywrites=false` and
  `authMechanism=SCRAM-SHA-256`; Mongoose, the migration tool and the backup tool must all use the
  same string.

## 6. Release contract

- `ci.yml` (lint, unit tests, build, secret scan) is the **merge gate**, unchanged.
- `release.yml` runs on `push: main` only. It builds → pushes to ACR → deploys to the **staging
  slot** → smoke-tests → **swaps** into production (FR-015).
- Azure authentication is **OIDC** (federated identity); **no Azure secret is stored** (FR-005,
  research R5).
- **Rollback** = swap the slot back, or re-deploy a previous SHA tag (SC-006).
- A failed build stops the workflow **before** any app is updated, so a release is all-or-nothing.
- The **smoke test goes through the frontend** (plan § D7), because the backend is private.
- The frontend is served on a **custom domain over TLS** (FR-016); the certificate is an App
  Service managed certificate.

## 7. Non-negotiable invariants

1. No credential in the client bundle (`SC-007`; CI's `scan-bundle.js`).
2. No credential committed to the repository (`scan-secrets.js`).
3. No long-lived Azure credential in GitHub.
4. The backend **and the database** have **no public inbound** (`contracts/network.md`).
5. The legacy Firebase project stays intact until reconciliation passes (Constitution V).
