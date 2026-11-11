# Implementation Plan: Azure Deployment and ServiceNow Integration

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
- **ServiceNow** → a **server-side** integration: the API holds the credential, the UI reaches it
  through a backend route.

This is a deployment/integration feature. The HTTP contract, authorisation and domain rules are
unchanged, so the existing CI gate (lint, tests, build, secret scan) stays the merge gate and a
**new** release workflow runs only on `main`.

The work is bounded because the containers already exist (`apps/server/Dockerfile`,
`apps/ui/Dockerfile`) and the app is stateless (all state in MongoDB, session is a JWT), so
"deploy" is configuration plus a workflow, not a re-architecture. The genuinely risky part is
**Cosmos compatibility**, and that is where the research below concentrates.

## Technical Context

**Language/Version**: Node 24 (`.nvmrc`, `engines`), TypeScript 6.0.3 (Angular-pinned).

**Primary Dependencies**: Angular 22, NestJS 11, Mongoose 9, MongoDB driver 7.x; `fetch` for
outbound HTTP (no new HTTP client).

**Storage**: **Azure Cosmos DB for MongoDB** (target). The app talks Mongoose/driver 7.x over the
MongoDB wire protocol; Cosmos exposes 5.0/6.0/7.0 wire-protocol versions.

**Testing**: Jest 30 (unit + integration via `mongodb-memory-server`), Cypress 16 (e2e). The
Cosmos path needs a **new, opt-in** integration suite (the in-memory `mongod` cannot test Cosmos).

**Target Platform**: Linux containers on Azure App Service.

**Project Type**: web application (two apps + shared libs + tools), unchanged.

**Performance Goals**: unchanged from `001` (the platform serves a municipality's bookings). The
only new performance concern is the Cosmos search scan (below).

**Constraints**: no secret in the client bundle (`SC-007`); no long-lived Azure credential in the
repository; `main` deployable with zero manual steps; rollback by re-deploying a previous tag.

**Scale/Scope**: the municipality's data — four collections, tens of thousands of documents at
most. Small enough that sharding is unnecessary and a modest Cosmos tier suffices.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan satisfies it |
|-----------|----------------------------|
| **I. Server-side enforcement** | The ServiceNow integration is server-side by construction (FR-008/009); the credential never reaches the browser. |
| **II. Test-first for domain logic** | The ServiceNow client and its error mapping get tests first (a mock ServiceNow); the deployment itself is verified by the workflow and a smoke test, not by unit tests (it has no domain logic). |
| **III. Measured coverage** | New server code (the ServiceNow module) is covered to the existing thresholds. Deployment YAML is not application code and is not in a coverage scope. |
| **IV. Single source of truth for types** | Any ServiceNow request/response type the UI needs lives in `libs/models`, not in the app. |
| **V. Reversible Migration** | Unchanged and re-affirmed: the legacy Firebase project stays intact until reconciliation passes. Cosmos is a **new** target; the legacy copy is untouched. The migration remains idempotent and re-runnable. |
| **Security constraints** | OIDC federation + managed identity (no stored secret); all config from App Service settings/Key Vault; the bundle scan (SC-002) still gates the UI. |

**Complexity Tracking**: no new abstraction beyond one provider seam for ServiceNow, mirroring the
existing mail transport (`notification/mail/mail-transport.ts`). That is the repository's
established pattern for an outbound provider, so it is a reuse, not a new layer.

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
6. **App Service can pull from ACR with a managed identity; GitHub Actions can federate to Azure
   with OIDC (no secret).** *(Microsoft Learn, "Deploy container to App Service", "Connect from
   Azure with OpenID Connect".)*
7. **Container Apps vs App Service.** Container Apps is the more "cloud-native" option (revisions,
   scale to zero); App Service is the request's explicit choice and is simpler for a two-container
   web app with slots. The plan follows the request (**App Service**) and notes Container Apps as
   the alternative if scale-to-zero is wanted.

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
│   └── servicenow.md    #   the ServiceNow integration contract (endpoint, auth, error mapping)
├── quickstart.md        # Phase 1 output — local + deploy runbook
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root) — the concrete layout

```text
# Infrastructure (new)
infra/
├── bicep/                       # Azure resources as Bicep (subscription-agnostic)
│   ├── main.bicep               #   resource group scope: ACR, plan, apps, Cosmos
│   ├── modules/
│   │   ├── acr.bicep            #   registry + managed identity pull role
│   │   ├── app-service.bicep    #   one Linux web app per image
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

# Application (existing, minimal change)
apps/server/
├── Dockerfile                   # unchanged (already multi-stage, already env-driven)
└── src/app/
    ├── config/env.validation.ts # + SERVICENOW_* settings (optional, like MAIL_*)
    └── servicenow/              # NEW module, mirrors notification/mail/ shape
        ├── service/servicenow.service.ts
        ├── service/servicenow.service.spec.ts
        ├── client/servicenow-client.ts      # the provider seam (mirrors IMailTransport)
        ├── client/servicenow-client.spec.ts
        ├── controller/servicenow.controller.ts
        ├── models/servicenow.dto.ts
        └── servicenow.module.ts

apps/ui/src/app/
├── core/servicenow.api.ts       # NEW — calls /api/servicenow/* (never ServiceNow directly)
└── features/.../                # the surface that triggers the action

libs/models/
└── servicenow.model.ts          # NEW — the request/response types the UI shares

# Cosmos-specific verification (new, opt-in)
apps/server/src/testing/cosmos-test-context.ts   # connects to a real Cosmos account from env
apps/server/src/app/**/*.cosmos.spec.ts          # opt-in suite, skipped without COSMOS_URI
```

**Structure Decision**: the repository is a web application (two apps + shared libs + tools). No
structure changes; the feature adds an `infra/` tree, a `release.yml`, a `servicenow/` module
mirroring the `notification/` module, and an opt-in Cosmos test context. The ServiceNow module
copies the mail transport's shape on purpose — one provider seam, an unconfigured implementation
that throws, and `fetch` for the call — so the codebase has one pattern for an outbound provider,
not two.

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

### D4 — Images are tagged by SHA; deploy is a separate workflow (FR-012)

`release.yml` runs on `push: main` only. It builds both images, pushes
`book-space-{server,ui}:<sha>` (and `:main`), and updates each App Service to the SHA tag. Rollback
is re-deploying a previous SHA tag (SC-006). The existing `ci.yml` is untouched, so the merge gate
and the release are independent and a red build cannot deploy.

### D5 — No Azure secret in the repository (FR-005/006)

A user-assigned managed identity with a **federated credential** trusts the GitHub repo's OIDC
token; `azure/login` exchanges it. App Service pulls from ACR with the same (or a second) managed
identity holding `AcrPull`. Nothing long-lived is stored. This is the single most important
security decision in the feature.

### D6 — ServiceNow is a server-side module mirroring the mail transport

`servicenow/client/servicenow-client.ts` defines an `IServiceNowClient` seam with:
- an `UnconfiguredServiceNowClient` that **throws** (so an unconfigured deployment fails visibly,
  `502` — FR-010), and
- an `HttpServiceNowClient` that POSTs to the configured endpoint with a bearer/basic credential
  read from the environment, with a timeout, exactly like `HttpMailTransport`.

`servicenow.controller.ts` exposes `/api/servicenow/*`, guarded by `AuthGuard('jwt')` +
`RolesGuard`, with `@Roles` set per the open question (who may call it). The UI calls the backend
only (FR-008/009).

### D7 — Configuration contract

New server settings, all optional (like `MAIL_*`), so an unconfigured deployment boots and fails
the action rather than refusing to start:

| Setting | Purpose |
|---------|---------|
| `SERVICENOW_ENDPOINT` | The ServiceNow Table API base URL |
| `SERVICENOW_TABLE` | The table to create records in (e.g. `incident`) |
| `SERVICENOW_USER` / `SERVICENOW_PASSWORD` | Basic-auth credential (or `SERVICENOW_TOKEN`) |
| `SERVICENOW_TIMEOUT_MS` | Outbound timeout (default 10 000, matching the mail transport) |

On App Service these are **app settings**; the credential values are **Key Vault references**
where a vault is used. None reaches the client bundle.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Cosmos compatibility surprises (indexes, `$regex`, `explain`) | Phase 0 spike against a real account; the opt-in Cosmos suite; vCore recommended. |
| A secret leaks into the bundle or the repo | OIDC + managed identity; the existing bundle/secret scans (SC-002) stay in CI. |
| Deployment is not reversible | SHA tags + App Service slots; rollback is a re-deploy (SC-006). |
| The migration is run against the wrong target | The migration keeps `--target`; the runbook requires the Cosmos URI and a `--dry-run` first. |
| ServiceNow outage blocks a request | Timeout + `502`; the triggering action is never silently lost. |
| Cost overrun (Cosmos) | Tier chosen in the spike; serverless/vCore autoscale documented in `operations.md`. |

## Phase Plan (hand-off to `/speckit.tasks`)

- **Phase 0 — Spike**: create a Cosmos account (vCore and RU-based), run the API + migration
  against each, record what breaks. **Decides open question 1.**
- **Phase 1 — Infra as code**: `infra/bicep` for ACR, identities, App Services, Cosmos;
  `ensure-collections.ts`.
- **Phase 2 — Release workflow**: `release.yml` (build → push → deploy), OIDC, smoke test.
- **Phase 3 — Cosmos migration**: adapt `tools/migration` if needed; ordered run; reconcile.
- **Phase 4 — ServiceNow module**: server module + client seam + controller + DTOs + UI api +
  tests.
- **Phase 5 — Docs and ops**: `README` § Deployment, `docs/operations.md` (Cosmos backup/DR,
  release/rollback, ServiceNow runbook), `AGENTS.md`.

## Post-Design Constitution Re-check

Re-evaluated after the design above: still passes. The only new abstraction (the ServiceNow
provider seam) mirrors an existing one; the migration stays reversible (Principle V) because the
legacy Firebase copy is untouched and Cosmos is a new target; and no secret is introduced into the
repository or the bundle.
