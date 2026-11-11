# Implementation Plan: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

**Branch**: `003-azure-deployment` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-azure-deployment/spec.md`

## Summary

Move the deployment target of the already-built platform (Angular UI + NestJS API, two
containers) from a self-managed stack to **Azure**:

- **Database** → **Azure DocumentDB** (the MongoDB-compatible vCore service, formerly
  "vCore-based Azure Cosmos DB for MongoDB"), addressed through the existing `DB_URI` contract.
  The API's data code does not change; the migration tool's `--target` does. The database is
  **private** (a private endpoint, public access disabled).
- **Compute** → **Azure App Service (Linux, containers)** with **deployment slots**, one web app
  per image, images in **Azure Container Registry**, built and released by **GitHub Actions**
  using a federated (OIDC) identity and a managed identity for the ACR pull. The frontend is
  served on a **custom domain over TLS**.
- **Topology** → the **backend is internal**: public access is disabled and it is reached only
  through a **private endpoint**, with the **frontend** as the sole caller over **VNet
  integration**. The browser talks to the frontend; the frontend proxies `/api` to the private
  backend.

This is a deployment feature. The HTTP contract, authorisation and domain rules are unchanged, so
the existing CI gate (lint, tests, build, secret scan) stays the merge gate and a **new** release
workflow runs only on `main`.

The work is bounded because the containers already exist (`apps/server/Dockerfile`,
`apps/ui/Dockerfile`) and the app is stateless (all state in the database, session is a JWT), so
"deploy" is configuration plus a workflow, not a re-architecture. The genuinely risky part is the
**private networking** (two private endpoints, two DNS zones, VNet integration) and the **tier's
compatibility**, and the research below concentrates there.

## Technical Context

**Language/Version**: Node 24 (`.nvmrc`, `engines`), TypeScript 6.0.3 (Angular-pinned).

**Primary Dependencies**: Angular 22, NestJS 11, Mongoose 9, MongoDB driver 7.x. No new runtime
dependency — the private path is Azure networking, and the app's `fetch` usage is unchanged.

**Storage**: **Azure DocumentDB** (`Microsoft.DocumentDB/mongoClusters`), MongoDB wire protocol
5.0–8.0. The app talks Mongoose/driver 7.x over the wire protocol, unchanged.

**Testing**: Jest 30 (unit + integration via `mongodb-memory-server`), Cypress 16 (e2e). Because
the tier is a real MongoDB, `explain()` and unique indexes behave as on `mongod`, so the existing
integration specs' intent carries over; a **new, opt-in** suite runs against the real cluster.

**Target Platform**: Linux containers on Azure App Service, backend and database behind private
endpoints, frontend on a custom domain.

**Project Type**: web application (two apps + shared libs + tools), unchanged.

**Performance Goals**: unchanged from `001`. The private hop adds negligible in-VNet latency;
because the tier is vCore, there is **no** `$regex` scan penalty (research R4).

**Constraints**: no secret in the client bundle (`SC-007`); no long-lived Azure credential in the
repository; the backend and the database must not be publicly reachable; `main` deployable with
zero manual steps; rollback by a slot swap or a previous tag.

**Scale/Scope**: the municipality's data — four collections, tens of thousands of documents at
most. Small enough that sharding is unnecessary and the smallest DocumentDB tier suffices.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan satisfies it |
|-----------|----------------------------|
| **I. Server-side enforcement** | Strengthened, not weakened: the API's own guards remain the enforcement (FR-011), and the network control is additional. The private backend and private database remove a whole class of public abuse before it reaches the app. |
| **II. Test-first for domain logic** | No domain logic changes. The private topology is verified by infrastructure checks and a connectivity test (SC-005), not by unit tests. |
| **III. Measured coverage** | Unchanged: no new application code is required by this feature (the private path is config). If the migration work needs a small code change, it carries its tests. |
| **IV. Single source of truth for types** | Unchanged: no new shared type is introduced. |
| **V. Reversible Migration** | Unchanged and re-affirmed: the legacy Firebase project stays intact until reconciliation passes. Azure DocumentDB is a **new** target; the legacy copy is untouched. The migration remains idempotent and re-runnable. |
| **Security constraints** | OIDC federation + managed identity (no stored secret); all config from App Service settings/Key Vault; the bundle scan (SC-002) still gates the UI; the backend and the database lose their public surface. |

**Complexity Tracking**: no new abstraction and no new application code. The feature adds
infrastructure-as-code and a release workflow, which are configuration, not a layer. This is
deliberately the smallest change that satisfies the request.

## Research Summary

Full detail in [research.md](./research.md). The findings that shape the plan:

1. **vCore is now its own service, "Azure DocumentDB"** (`Microsoft.DocumentDB/mongoClusters`),
   separate from RU-based "Azure Cosmos DB for MongoDB". It is a real MongoDB (wire protocol
   5.0–8.0) with 99.03 % operator compatibility, so the driver, Mongoose and `DB_URI` are
   unchanged. *(Microsoft Learn, *Azure DocumentDB FAQ* and *MQL compatibility*.)*
2. **Because the tier is vCore, the RU-based constraints do not apply.** A unique index can be
   created at any time (no empty-collection rule), a case-insensitive `$regex` does not force a
   collection scan, and `explain()` works as on `mongod`. *(Microsoft Learn, *Azure DocumentDB
   indexing* and *How to read explain output*.)*
3. **Azure DocumentDB supports Private Link**, so the database can be private too (decision 3).
   The private endpoint's DNS zone is `privatelink.mongocluster.cosmos.azure.com`.
   *(Microsoft Learn, *Use Azure Private Link* and *Private endpoint DNS configuration*.)*
4. **A private endpoint gives inbound privacy; VNet integration gives outbound access; they use
   *different* subnets.** This is the "internal backend, only the frontend calls it" shape (US3).
   *(Microsoft Learn, *Use Private Endpoints for Apps* and *Integrate your app with an Azure
   virtual network*.)* A private endpoint is available on **Basic and above**.
5. **App Service can pull from ACR with a managed identity; GitHub Actions can federate to Azure
   with OIDC (no secret).** *(Microsoft Learn, *Deploy container to App Service*, *Connect from
   Azure with OpenID Connect*.)*
6. **Deployment slots** give a warm swap and a zero-downtime rollback, and require **Standard or
   higher**. *(Microsoft Learn, *Set up staging environments in Azure App Service*.)*
7. **A custom domain with an App Service managed certificate** is the TLS story for the frontend;
   it needs the DNS record first. *(Microsoft Learn, *Map an existing custom DNS name*.)*
8. **Container Apps vs App Service.** Container Apps is the more "cloud-native" option (revisions,
   scale to zero); App Service is the request's explicit choice and is simpler for a two-container
   web app with slots. The plan follows the request (**App Service**) and notes Container Apps as
   the alternative — and as a natural home for the **migration job** (a run-to-completion task with
   VNet integration, which solves the "the database is private" problem).

## Project Structure

### Documentation (this feature)

```text
specs/003-azure-deployment/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — the decisions above, with sources
├── data-model.md        # Phase 1 output — index/partition notes and the migration order
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
│   ├── main.bicep               #   resource group scope: ACR, plan, apps, database, network
│   ├── modules/
│   │   ├── acr.bicep            #   registry + managed identity pull role
│   │   ├── app-service.bicep    #   one Linux web app per image + slots + custom domain
│   │   ├── network.bicep        #   VNet, the subnets, the two private DNS zones
│   │   ├── private-endpoint.bicep #  the backend's and the database's private endpoints
│   │   ├── documentdb.bicep     #   the mongoCluster + database + collections/indexes
│   │   └── identity.bicep       #   user-assigned identity + federated credential (OIDC)
│   └── params/
│       ├── dev.bicepparam
│       └── prod.bicepparam      #   region (default Poland Central), tier, host name
└── scripts/
    └── ensure-collections.ts    # creates collections + indexes idempotently

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
`env.validation.ts`. An Azure DocumentDB connection string
(`mongodb+srv://…@<cluster>.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false`)
matches that pattern, so **no code changes**. The plan keeps the validation as-is and records the
form in `contracts/deployment.md`.

> One detail to verify in the spike: DocumentDB's connection string carries
> `retrywrites=false` and `authMechanism=SCRAM-SHA-256`. Mongoose passes these through, but the
> migration tool and the backup tool build their own connections — they must use the same string.

### D2 — Collections and indexes are created idempotently (finding 2)

Because the tier is a real MongoDB, a unique index can be added at any time, so this is no longer a
hard ordering constraint. The plan still creates collections and indexes **before** the seed and
the migration as good practice, so a partially-migrated database is never left without its
uniqueness rules:

1. Create the database and the four collections.
2. Create the indexes (`users.email` and `buildings.{city,property}` unique, plus the query
   indexes), idempotently.
3. Seed the twelve reference facilities.
4. Run the migration (`--target` = the DocumentDB connection string).
5. Reconcile (`SC-003`).

`infra/scripts/ensure-collections.ts` performs steps 1–2 idempotently.

### D3 — The search is unchanged (finding 2)

The `$regex` + `$options: 'i'` search is kept as-is. On vCore it does not force a collection scan,
so no workaround and no schema change is needed. The spike confirms the timing against the real
cluster and records it.

### D4 — The backend is private; the frontend is the only caller (US3, finding 4)

This is the request's "BE internal, just FE can call it", achieved with three Azure constructs, all
in the VNet:

```text
Internet ──▶ FE App Service (public, custom domain) ──VNet integration──▶ private DNS
                                                                          ├─ backend private endpoint
                                                                          └─ database private endpoint
                                                                                   │
   browser ── loads the SPA, calls /api on the FE's own origin ──┐                  ▼
                                                                 └──▶ FE nginx proxy ──▶ BE App Service
                                                                        (public access DISABLED) ──▶ DocumentDB
                                                                                                   (public access DISABLED)
```

- **Backend App Service**: public network access **disabled**; a **private endpoint** in the VNet
  gives inbound access.
- **Database**: public access **disabled**; a **private endpoint** in the VNet (decision 3).
- **Frontend App Service**: keeps public inbound (it is the public surface, on the custom domain)
  and gets **VNet integration** on a **separate subnet** for outbound calls to both private
  endpoints. The subnets must differ from each private endpoint's subnet (finding 4).
- **Private DNS zones**: `privatelink.azurewebsites.net` (backend) and
  `privatelink.mongocluster.cosmos.azure.com` (database), both linked to the VNet.

The API's own auth is untouched (FR-011): the private path is a second wall, not a replacement for
`AuthGuard`/`RolesGuard`.

**Cost/plan note**: a private endpoint requires **Basic or higher**, and slots require
**Standard or higher**; decision 4 is a **Standard+** plan (PremiumV3 recommended for production).

### D5 — Images are tagged by SHA; deploy uses a slot; `ci.yml` is separate (FR-013/015)

`release.yml` runs on `push: main` only. It builds both images, pushes
`book-space-{server,ui}:<sha>` (and `:main`), deploys to a **staging slot**, smoke-tests the slot,
then **swaps** it into production. Rollback is a swap back (SC-006). The existing `ci.yml` is
untouched, so the merge gate and the release are independent and a red build cannot deploy.

> Slot note: a slot is a separate app with its **own** private endpoint (they cannot be shared),
> so the plan either provisions a slot private endpoint or runs the production slot without a
> staging one for the first release. This is a Phase 1 decision recorded in the params file
> (`spec.md` edge cases).

### D6 — No Azure secret in the repository (FR-005/006)

A user-assigned managed identity with a **federated credential** trusts the GitHub repo's OIDC
token; `azure/login` exchanges it. App Service pulls from ACR with the same (or a second) managed
identity holding `AcrPull`. Nothing long-lived is stored. This is the single most important
security decision in the feature.

### D7 — The smoke test respects the private backend (edge case)

Because the backend is private, the release workflow's post-deploy check **cannot** `curl` the API
from the public internet. The check targets the **frontend's** proxied path
(`GET <custom-domain>/api/buildings` returns the twelve facilities), which proves the whole chain —
frontend, proxy, VNet, private endpoint, API, private database — in one request.

### D8 — Configuration contract

| App | Setting | Notes |
|-----|---------|-------|
| server | `DB_URI` | the DocumentDB connection string (`mongodb+srv://…mongocluster.cosmos.azure.com/…`) |
| server | `JWT_SECRET` | ≥ 32 chars |
| server | `SEED_REFERENCE_DATA`, `SUMMARY_DENY_LIST`, `MAIL_*`, `SISK_CONTACT_EMAIL`, `PUBLIC_RATE_LIMIT*`, `NOTIFICATION_QUOTA*` | unchanged, optional |
| ui | `API_UPSTREAM` | the API origin nginx proxies `/api/` to (the backend's private host name) |

On App Service these are **app settings**; credentials are **Key Vault references** where a vault
is used. None reaches the client bundle.

### D9 — Custom domain and region are parameters (FR-016/017)

The frontend's custom domain, its managed certificate, and the deployment region (default
**Poland Central**) live in the Bicep params, so the data-residency choice is explicit and
reviewable, not buried in a module.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| DocumentDB compatibility surprises | Phase 0 spike runs the **compatibility assessment** (the VS Code migration extension) and the API + migration against a real cluster; the opt-in suite pins the result. |
| The private endpoints misconfigured (DNS, subnet) | The topology is Bicep (FR-012); SC-005 is an explicit connectivity test; the two DNS zones are named in `contracts/network.md`. |
| The migration cannot reach a private database | The runbook requires a VNet-joined job or a jump box (research R11); a temporary firewall rule is a recorded, short-lived exception. |
| A smoke test that silently passes because it cannot reach a private API | The smoke test goes through the frontend (D7). |
| A secret leaks into the bundle or the repo | OIDC + managed identity; the existing bundle/secret scans (SC-002) stay in CI. |
| Deployment is not reversible | Slot swap + SHA tags; rollback is a swap or a re-deploy (SC-006). |
| The migration is run against the wrong target | The migration keeps `--target`; the runbook requires the connection string and a `--dry-run` first. |
| Cost overrun (database tier, private endpoints, Standard plan) | The tier and plan are parameters; the spike records the baseline; a non-production environment can use a smaller tier and no HA. |

## Phase Plan (hand-off to `/speckit.tasks`)

- **Phase 0 — Spike**: create an **Azure DocumentDB** cluster, run the compatibility assessment,
  then the API + migration against it; record the timings and any unsupported operator.
- **Phase 1 — Network and infra as code**: `infra/bicep` for the VNet, subnets, the two private DNS
  zones, the two private endpoints, ACR, identities, App Services (with slots), the custom domain,
  and the database; `ensure-collections.ts`.
- **Phase 2 — Release workflow**: `release.yml` (build → push → deploy to slot → smoke → swap),
  OIDC.
- **Phase 3 — Migration**: run from a VNet-joined job; ordered run; reconcile; sign off (#47).
- **Phase 4 — Private verification**: SC-005 (public request refused; frontend path works; database
  unreachable publicly).
- **Phase 5 — Docs and ops**: `README` § Deployment, `docs/operations.md` (database backup/DR,
  release/rollback, the private topology), `AGENTS.md`.

## Post-Design Constitution Re-check

Re-evaluated after the design above: still passes. The plan adds no application code and no
abstraction; it strengthens the security posture (Principle I, Security constraints) rather than
weakening it; and the migration stays reversible (Principle V) because the legacy Firebase copy is
untouched and Azure DocumentDB is a new target.
