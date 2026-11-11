# Implementation Plan: Azure Deployment (Cosmos DB, App Services, Internal Backend)

**Branch**: `003-azure-deployment` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-azure-deployment/spec.md`

## Summary

Move the deployment target of the already-built platform (Angular UI + NestJS API, two
containers) from a self-managed stack to **Azure**:

- **Database** → **Azure Cosmos DB for MongoDB**, addressed through the existing `DB_URI`
  contract. The API's data code does not change; the migration tool's `--target` does.
- **Compute** → **Azure App Service (Linux, containers)**, one web app per image, images in
  **Azure Container Registry**, built and released by **GitHub Actions** using a federated
  (OIDC) identity and a managed identity for the ACR pull.
- **Topology** → the **backend is internal**: public access is disabled and it is reached only
  through a **private endpoint**, with the **frontend** as the sole caller over **VNet
  integration**. The browser talks to the frontend; the frontend proxies `/api` to the private
  backend.

This is a deployment feature. The HTTP contract, authorisation and domain rules are unchanged, so
the existing CI gate (lint, tests, build, secret scan) stays the merge gate and a **new** release
workflow runs only on `main`.

The work is bounded because the containers already exist (`apps/server/Dockerfile`,
`apps/ui/Dockerfile`) and the app is stateless (all state in MongoDB, session is a JWT), so
"deploy" is configuration plus a workflow, not a re-architecture. The genuinely risky parts are
**Cosmos compatibility** and **the private networking**, and the research below concentrates
there.

## Technical Context

**Language/Version**: Node 24 (`.nvmrc`, `engines`), TypeScript 6.0.3 (Angular-pinned).

**Primary Dependencies**: Angular 22, NestJS 11, Mongoose 9, MongoDB driver 7.x. No new runtime
dependency — the private path is Azure networking, and the app's `fetch` usage is unchanged.

**Storage**: **Azure Cosmos DB for MongoDB** (target). The app talks Mongoose/driver 7.x over the
MongoDB wire protocol; Cosmos exposes 5.0/6.0/7.0 wire-protocol versions.

**Testing**: Jest 30 (unit + integration via `mongodb-memory-server`), Cypress 16 (e2e). The
Cosmos path needs a **new, opt-in** integration suite (the in-memory `mongod` cannot test Cosmos).

**Target Platform**: Linux containers on Azure App Service, backend behind a private endpoint.

**Project Type**: web application (two apps + shared libs + tools), unchanged.

**Performance Goals**: unchanged from `001`. The one new performance concern is the Cosmos search
scan (below). The private hop adds a negligible in-VNet latency.

**Constraints**: no secret in the client bundle (`SC-007`); no long-lived Azure credential in the
repository; the backend must not be publicly reachable; `main` deployable with zero manual steps;
rollback by re-deploying a previous tag.

**Scale/Scope**: the municipality's data — four collections, tens of thousands of documents at
most. Small enough that sharding is unnecessary and a modest Cosmos tier suffices.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan satisfies it |
|-----------|----------------------------|
| **I. Server-side enforcement** | Strengthened, not weakened: the API's own guards remain the enforcement (FR-011), and the network control is additional. The private backend removes a whole class of public abuse before it reaches the app. |
| **II. Test-first for domain logic** | No domain logic changes. The private topology is verified by infrastructure checks and a connectivity test (SC-005), not by unit tests. |
| **III. Measured coverage** | Unchanged: no new application code is required by this feature (the private path is config). If the Cosmos work needs a small code change, it carries its tests. |
| **IV. Single source of truth for types** | Unchanged: no new shared type is introduced. |
| **V. Reversible Migration** | Unchanged and re-affirmed: the legacy Firebase project stays intact until reconciliation passes. Cosmos is a **new** target; the legacy copy is untouched. The migration remains idempotent and re-runnable. |
| **Security constraints** | OIDC federation + managed identity (no stored secret); all config from App Service settings/Key Vault; the bundle scan (SC-002) still gates the UI; the backend loses its public surface. |

**Complexity Tracking**: no new abstraction and no new application code. The feature adds
infrastructure-as-code and a release workflow, which are configuration, not a layer. This is
deliberately the smallest change that satisfies the request.

## Research Summary

Full detail in [research.md](./research.md). The findings that change the plan:

1. **Cosmos DB for MongoDB is wire-protocol compatible, so the app code is unchanged** — the
   account endpoint is `*.mongo.cosmos.azure.com` and any driver that speaks the wire protocol
   connects. `DB_URI` stays the only seam. *(Microsoft Learn, "6.0/7.0 Supported Features and
   Syntax".)*
2. **RU-based Cosmos can only create a unique index on an empty collection, and `mongorestore`
   needs `--noIndexRestore`.** This repo has two unique indexes (`users.email`,
   `buildings.{city,property}`). Therefore the **collections and their unique indexes must exist
   before the seed/migration writes any document**. The plan makes that an explicit, ordered step.
3. **Case-insensitive `$regex` forces a collection scan on RU-based Cosmos.** The client/booking
   search uses `$regex` + `$options: 'i'` (`buildBookingQuery`, the clients list). Correctness is
   preserved; cost is measured. *(Microsoft Learn, "Indexing".)*
4. **Multi-document transactions are single-collection, non-sharded only.** The app uses none; the
   plan forbids introducing one.
5. **`explain('queryPlanner')` is a `mongod` behaviour.** The index tests stay on
   `mongodb-memory-server`; Cosmos gets its own opt-in suite.
6. **A private endpoint gives inbound privacy; VNet integration gives outbound access; they use
   *different* subnets.** This is exactly the "internal backend, only the frontend calls it" shape
   (US3). *(Microsoft Learn, "Use Private Endpoints for Apps" and "Integrate your app with an Azure
   virtual network".)* A private endpoint is available on **Basic and above**.
7. **App Service can pull from ACR with a managed identity; GitHub Actions can federate to Azure
   with OIDC (no secret).** *(Microsoft Learn, "Deploy container to App Service", "Connect from
   Azure with OpenID Connect".)*
8. **Container Apps vs App Service.** Container Apps is the more "cloud-native" option (revisions,
   scale to zero); App Service is the request's explicit choice and is simpler for a two-container
   web app with slots. The plan follows the request (**App Service**) and notes Container Apps as
   the alternative.

**Tier recommendation**: **Cosmos DB for MongoDB vCore** (a real MongoDB 5.0–7.0). It removes
findings 2 and 3 entirely and gives `explain`/`listIndexes` parity with the tests. RU-based is
cheaper and is documented as the alternative if cost dominates. The spike (Phase 0) confirms
against a real account before the choice is locked.

## Project Structure

### Documentation (this feature)

```text
specs/003-azure-deployment/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — the decisions above, with sources
├── data-model.md        # Phase 1 output — Cosmos indexing/partition notes
├── contracts/           # Phase 1 output
│   ├── deployment.md    #   the environment/settings contract (what each app needs)
│   └── network.md       #   the private-topology contract (who may reach what)
├── quickstart.md        # Phase 1 output — local + deploy runbook
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root) — the concrete layout

```text
# Infrastructure (new)
infra/
├── bicep/                       # Azure resources as Bicep (subscription-agnostic)
│   ├── main.bicep               #   resource group scope: ACR, plan, apps, Cosmos, network
│   ├── modules/
│   │   ├── acr.bicep            #   registry + managed identity pull role
│   │   ├── app-service.bicep    #   one Linux web app per image
│   │   ├── network.bicep        #   VNet, the two subnets, private DNS zone
│   │   ├── private-endpoint.bicep #  the backend's private endpoint (public access off)
│   │   ├── cosmos.bicep         #   MongoDB-API account + database + collections/indexes
│   │   └── identity.bicep       #   user-assigned identity + federated credential (OIDC)
│   └── params/
│       ├── dev.bicepparam
│       └── prod.bicepparam
└── scripts/
    └── ensure-collections.ts    # creates collections + unique indexes BEFORE data (finding 2)

# CI/CD (new)
.github/workflows/
├── ci.yml                       # unchanged — the merge gate
└── release.yml                  # NEW — build → push to ACR → deploy both App Services

# Application (existing, no change expected)
apps/server/Dockerfile           # unchanged (already multi-stage, already env-driven)
apps/ui/Dockerfile               # unchanged
apps/ui/nginx.conf.template      # unchanged — the /api proxy is what makes US3 work
```

**Structure Decision**: the repository is a web application (two apps + shared libs + tools). No
structure changes; the feature adds an `infra/` tree and a `release.yml`. Notably, **no application
code changes**: the private topology is achieved entirely in Azure networking, and the frontend's
existing nginx `/api` proxy (`apps/ui/nginx.conf.template`, upstream `API_UPSTREAM`) is exactly the
mechanism US3 needs — the frontend is already the only caller of the API, so making the backend
private is a networking change, not an app change.

## Design Decisions

### D1 — `DB_URI` is the only database seam (unchanged code)

The API reads `DB_URI` in `app.module.ts` and validates it against `/^mongodb(\+srv)?:\/\//` in
`env.validation.ts`. A Cosmos MongoDB-API connection string already matches that pattern, so
**no code changes**. The plan keeps the validation as-is and records the Cosmos form in
`contracts/deployment.md`.

### D2 — Collections and unique indexes exist before data (finding 2)

Because RU-based Cosmos cannot add a unique index to a populated collection, the migration order
becomes an explicit contract:

1. Create the database and the four collections.
2. Create the unique indexes (`users.email`, `buildings.{city,property}`) and the query indexes,
   **while empty**.
3. Seed the twelve reference facilities.
4. Run the migration (`--target` = Cosmos).
5. Reconcile (`SC-003`).

`infra/scripts/ensure-collections.ts` performs steps 1–2 idempotently. On vCore (recommended) this
is a safety net rather than a requirement; on RU-based it is mandatory.

### D3 — Search stays correct; its Cosmos cost is measured (finding 3)

The `$regex` + `$options: 'i'` search is kept because the data is small and correctness is not
negotiable. The plan measures it on the spike account and records the outcome; the fallback, if it
matters, is a normalised lower-case field with a non-case-insensitive regex (a schema change,
deferred until the measurement justifies it).

### D4 — The backend is private; the frontend is the only caller (US3, finding 6)

This is the request's "BE internal, just FE can call it", and it is achieved with three Azure
constructs, all in the VNet:

```text
Internet ──▶ FE App Service (public) ──VNet integration──▶ private DNS ──▶ BE private endpoint
                     │                                                          │
                     └── browser loads the SPA, calls /api on the FE's own origin ┘
                                                                        BE App Service
                                                                   (public access DISABLED)
```

- **Backend App Service**: public network access **disabled**; a **private endpoint** in the VNet
  gives inbound access. (A private endpoint needs Basic+.)
- **Frontend App Service**: keeps public inbound (it is the public surface) and gets **VNet
  integration** on a **different subnet** for outbound calls to the backend's private host name.
  The two subnets must differ (finding 6).
- **Private DNS zone** (`privatelink.azurewebsites.net`) linked to the VNet, so the frontend
  resolves the backend's host name to the private IP.

The API's own auth is untouched (FR-011): the private path is a second wall, not a replacement for
`AuthGuard`/`RolesGuard`.

**Why this and not the cheaper option**: access restrictions by the frontend's outbound IP are
weaker (App Service outbound IPs are shared and can change). The private endpoint is the boundary
the requirement implies. The alternative is recorded in open question 1.

**Cost/plan note**: a private endpoint requires **Basic or higher**, and slots require
**Standard or higher** (open question 4).

### D5 — Images are tagged by SHA; deploy is a separate workflow (FR-013)

`release.yml` runs on `push: main` only. It builds both images, pushes
`book-space-{server,ui}:<sha>` (and `:main`), and updates each App Service to the SHA tag. Rollback
is re-deploying a previous SHA tag (SC-006). The existing `ci.yml` is untouched, so the merge gate
and the release are independent and a red build cannot deploy.

### D6 — No Azure secret in the repository (FR-005/006)

A user-assigned managed identity with a **federated credential** trusts the GitHub repo's OIDC
token; `azure/login` exchanges it. App Service pulls from ACR with the same (or a second) managed
identity holding `AcrPull`. Nothing long-lived is stored. This is the single most important
security decision in the feature.

### D7 — The smoke test respects the private backend (edge case)

Because the backend is private, the release workflow's post-deploy check **cannot** `curl` the API
from the public internet. The check targets the **frontend's** proxied path (`GET <fe>/api/buildings`
returns the twelve facilities), which proves the whole chain — frontend, proxy, VNet, private
endpoint, API, Cosmos — in one request. A direct API check is an optional VNet-joined step.

### D8 — Configuration contract

| App | Setting | Notes |
|-----|---------|-------|
| server | `DB_URI` | the Cosmos MongoDB connection string (must match `/^mongodb(\+srv)?:\/\//`) |
| server | `JWT_SECRET` | ≥ 32 chars |
| server | `SEED_REFERENCE_DATA`, `SUMMARY_DENY_LIST`, `MAIL_*`, `SISK_CONTACT_EMAIL`, `PUBLIC_RATE_LIMIT*`, `NOTIFICATION_QUOTA*` | unchanged, optional |
| ui | `API_UPSTREAM` | the API origin nginx proxies `/api/` to (the private host name) |

On App Service these are **app settings**; credentials are **Key Vault references** where a vault
is used. None reaches the client bundle.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Cosmos compatibility surprises (indexes, `$regex`, `explain`) | Phase 0 spike against a real account; the opt-in Cosmos suite; vCore recommended. |
| The private endpoint misconfigured (DNS, subnet) | The topology is Bicep (FR-012), so it is reproducible; SC-005 is an explicit connectivity test. |
| A smoke test that silently passes because it cannot reach a private API | The smoke test goes through the frontend (D7). |
| A secret leaks into the bundle or the repo | OIDC + managed identity; the existing bundle/secret scans (SC-002) stay in CI. |
| Deployment is not reversible | SHA tags + App Service slots; rollback is a re-deploy (SC-006). |
| The migration is run against the wrong target | The migration keeps `--target`; the runbook requires the Cosmos URI and a `--dry-run` first. |
| Cost overrun (Cosmos, private endpoints, plan tier) | Tier chosen in the spike; the private endpoint is one resource; the plan tier is an open question. |

## Phase Plan (hand-off to `/speckit.tasks`)

- **Phase 0 — Spike**: create a Cosmos account (vCore and RU-based), run the API + migration
  against each, record what breaks. **Decides open question 2.**
- **Phase 1 — Network and infra as code**: `infra/bicep` for the VNet, subnets, private DNS zone,
  private endpoint, ACR, identities, App Services, Cosmos; `ensure-collections.ts`.
- **Phase 2 — Release workflow**: `release.yml` (build → push → deploy), OIDC, smoke test via the
  frontend.
- **Phase 3 — Cosmos migration**: adapt `tools/migration` if needed; ordered run; reconcile.
- **Phase 4 — Private-backend verification**: SC-005 (public request refused; frontend path
  works).
- **Phase 5 — Docs and ops**: `README` § Deployment, `docs/operations.md` (Cosmos backup/DR,
  release/rollback, the private topology), `AGENTS.md`.

## Post-Design Constitution Re-check

Re-evaluated after the design above: still passes. The plan adds no application code and no
abstraction; it strengthens the security posture (Principle I, Security constraints) rather than
weakening it; and the migration stays reversible (Principle V) because the legacy Firebase copy is
untouched and Cosmos is a new target.
