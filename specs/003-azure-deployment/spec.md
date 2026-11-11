# Feature Specification: Azure Deployment and ServiceNow Integration

**Feature Branch**: `003-azure-deployment`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Review the issue which stays, I want to make migration not to Firebase
but to Azure Cosmos DB. Also I want to have for backend and frontend Azure App Services and a
container registry connected to a GitHub job. ServiceNow should be internal and the frontend can
call it. Prepare plan for this."

## Context

`specs/001-booking-platform-rewrite/` defines the application: an Angular UI and a NestJS API over
MongoDB, deployed as two containers behind a reverse proxy (README § Deployment). The remaining
open task is **#47 (T043)** — "execute the migration, reconcile and sign off" — whose target today
is a self-managed MongoDB reached through `DB_URI`.

This feature changes three things, and nothing else:

1. The **runtime database** becomes **Azure Cosmos DB for MongoDB**, and the migration tool
   (`tools/migration`) writes into it. `DB_URI` remains the single configuration seam, so the API
   code is unchanged; only the deployment and the migration target move.
2. The two containers are hosted on **Azure App Service (Linux, containers)** with images in
   **Azure Container Registry (ACR)**, built and released by a **GitHub Actions** workflow.
3. **ServiceNow** is integrated as an **internal, server-side** capability: the API owns the
   ServiceNow credentials and the UI reaches the feature **through the API**, never by calling
   ServiceNow from the browser.

The application's behaviour (contracts, authorisation, domain rules) does not change. This is a
deployment and integration feature, not a rewrite.

## Clarifications

### Session 2026-11-08

- Q: "ServiceNow should be internal and just FE can call it" — does the browser call ServiceNow
  directly? → **A: No.** The UI calls a **backend** route; the backend calls ServiceNow. A direct
  browser→ServiceNow call would put a ServiceNow credential in the client bundle, which `SC-007`
  forbids and the CI bundle scan fails on. "Internal" is read as "the ServiceNow integration is a
  server-side, non-public capability". Recorded as an open question below in case the intent was
  different.
- Q: Which Cosmos DB API? → **A: the MongoDB API** (`*.mongo.cosmos.azure.com`), so the driver and
  `DB_URI` stay as they are. The tier (RU-based vs vCore) is an open question resolved by a spike.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy both applications to Azure from a merge to `main` (Priority: P1)

A maintainer merges a change to `main`. A GitHub Actions job builds the two container images,
pushes them to Azure Container Registry, and updates both Azure App Services so the new revision
is live — with no manual step and no long-lived Azure credential stored in the repository.

**Why this priority**: it is the whole point of the request. Without it there is no deployment.

**Independent Test**: merge a trivial change to `main`; the workflow completes, and the UI and API
respond on their App Service host names. Re-running the workflow deploys the same commit
idempotently.

**Acceptance Scenarios**:

1. **Given** a green pull request merged to `main`, **When** the release workflow runs, **Then**
   both images are pushed to ACR and both App Services serve the new revision.
2. **Given** the repository's CI secret scan, **When** the release workflow is inspected, **Then**
   it authenticates to Azure with a **federated (OIDC) identity** and stores no Azure secret.
3. **Given** a failed image build, **When** the workflow stops, **Then** the previously deployed
   revision keeps serving (the release is not a half-update).
4. **Given** the API container, **When** it starts on App Service, **Then** it reads `DB_URI`,
   `JWT_SECRET` and the rest from **App Service settings**, not from a file in the image.

---

### User Story 2 - Run the booking platform on Azure Cosmos DB for MongoDB (Priority: P2)

The runtime database is Azure Cosmos DB for MongoDB. The API connects with the same `DB_URI`
contract; the migration tool (T043, #47) writes the legacy data into Cosmos DB and reconciles.

**Why this priority**: it is the data half of the deployment. It can be done after the compute
move, and it is the riskiest because of Cosmos compatibility limits.

**Independent Test**: point `DB_URI` at a Cosmos account, boot the API, and run the existing
integration suites against it (or a representative subset); the booking read, the unique
`{city, property}` facility key and the client search all behave as on a real `mongod`.

**Acceptance Scenarios**:

1. **Given** an empty Cosmos database, **When** the reference seed and the migration run, **Then**
   the twelve facilities, clients, users and bookings are present and every booking's `clientId`
   and `place` resolve (`SC-003`).
2. **Given** the `{city, property}` unique rule, **When** a second facility with the same key is
   inserted, **Then** the write is refused (the unique index is enforced on Cosmos).
3. **Given** a public or staff booking search, **When** the search term is used, **Then** it
   returns the same rows as on `mongod` (correctness first; performance is measured, see the
   open question on the search scan).
4. **Given** the migration is re-run, **When** it completes, **Then** it is idempotent and the
   reconciliation counts are unchanged.

---

### User Story 3 - Raise a ServiceNow record from the application (Priority: P3)

A staff member (or, if allowed, a public visitor) triggers a ServiceNow action from the UI — for
example raising an incident or a request. The UI calls the **backend**, which holds the ServiceNow
credential and calls ServiceNow. The credential never leaves the server.

**Why this priority**: it is a new integration, valuable but not required for the platform to run.
It can land after the deployment works.

**Independent Test**: from the UI, trigger the action; the backend calls ServiceNow (against a
mock in tests, a real instance in staging) and the UI shows the returned record number. Inspecting
the built client bundle shows no ServiceNow credential.

**Acceptance Scenarios**:

1. **Given** a configured ServiceNow endpoint and credential, **When** the user triggers the
   action, **Then** the backend creates the ServiceNow record and answers the record number.
2. **Given** ServiceNow is unconfigured, **When** the action is triggered, **Then** the API
   answers a surfaced failure (`502`), matching the mail transport's "fail, do not drop" rule.
3. **Given** the built UI bundle, **When** it is scanned, **Then** no ServiceNow credential,
   endpoint secret or token is present.
4. **Given** a non-authorised caller, **When** they call the backend action, **Then** it is
   refused by the same `RolesGuard` rules the rest of the API uses.

---

### Edge Cases

- **Cosmos unique-index ordering.** RU-based Cosmos can only create a unique index while the
  collection is **empty**, and `mongorestore` needs `--noIndexRestore`. The seed and the migration
  must therefore run **after** the collections and their unique indexes exist. The plan owns the
  order.
- **Case-insensitive search on RU-based Cosmos.** A `$regex` with the `i` option forces a
  collection scan. The client/booking search must keep returning correct rows; its cost is
  measured and, if it matters, addressed (see open questions).
- **Multi-document transactions.** Cosmos supports them only within a single, non-sharded
  collection. The application uses none today; the plan forbids introducing a cross-collection
  transaction.
- **`explain('queryPlanner')` assertions.** The server's index tests assert the planner picks an
  index; that behaviour is a `mongod` property. Those tests stay on `mongodb-memory-server`; a
  Cosmos-specific check is a separate, opt-in suite.
- **Sharded vs unsharded.** A sharded Cosmos collection makes every unique index compound with the
  shard key. The collections are small; the plan defaults to **unsharded** unless a volume
  threshold is crossed.
- **ServiceNow unreachable / slow.** A hanging ServiceNow must not hold the request; the client
  uses the same timeout rule the mail transport uses.
- **Secret rotation.** The Cosmos connection string and the ServiceNow credential are rotated by
  updating the App Service setting (or Key Vault), not by rebuilding the image.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The runtime database MUST be **Azure Cosmos DB for MongoDB**, addressed through the
  existing `DB_URI` connection-string contract, with no change to the API's data-access code.
- **FR-002**: The migration tool (`tools/migration`) MUST write into Cosmos DB through the same
  `--target` connection string it already accepts, with no code change beyond what Cosmos
  compatibility requires.
- **FR-003**: The backend (NestJS) and the frontend (Angular/nginx) MUST each be deployed as a
  **container on Azure App Service (Linux)**.
- **FR-004**: Container images MUST be built by CI and stored in **Azure Container Registry**,
  tagged with the commit SHA and (for `main`) a moving tag.
- **FR-005**: A **GitHub Actions** workflow MUST build, push and deploy on a merge to `main`, and
  MUST authenticate to Azure using a **federated (OIDC) identity** — no stored Azure secret.
- **FR-006**: App Service MUST pull the images from ACR using a **managed identity**, not a
  registry password in a workflow.
- **FR-007**: All configuration MUST come from **App Service settings** (or Key Vault references);
  the images MUST contain no environment-specific value and no secret.
- **FR-008**: The **ServiceNow integration MUST be server-side**. The API holds the credential; the
  browser MUST NOT receive it or call ServiceNow directly.
- **FR-009**: The UI MUST reach the ServiceNow capability through a **backend route** that applies
  the same authentication and authorisation as the rest of the API.
- **FR-010**: A missing or unconfigured ServiceNow (or mail) provider MUST surface as a failure
  (`502`), never as a silent no-op — the rule `FR-036` already sets for mail.
- **FR-011**: The UI MUST continue to call the API same-origin (`/api`), so the App Service
  deployment needs no CORS exception and the bundle is not tied to a host name.
- **FR-012**: The existing **CI gate** (lint, unit tests, build, secret scan) MUST remain the merge
  gate; deployment MUST be a **separate** workflow triggered on `main`, so a red build cannot
  deploy.
- **FR-013**: The Cosmos compatibility constraints (unique-index creation order, single-collection
  transactions, `$regex` scan behaviour) MUST be honoured and recorded.

### Key Entities *(include if feature involves data)*

- **Container image** — one per app (`book-space-server`, `book-space-ui`), tagged by commit SHA,
  stored in ACR, pulled by an App Service.
- **App Service** — a Linux web app running one image, with app settings and a managed identity.
- **Release workflow** — the GitHub Actions job that builds, pushes and deploys on `main`.
- **Cosmos DB account** — the MongoDB-API account holding the `book_space` database.
- **ServiceNow record** — the external object the integration creates (incident/request), keyed by
  its `sys_id`/number.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merge to `main` results in both applications serving the new revision with **zero
  manual steps** and **no stored Azure credential** in the repository.
- **SC-002**: The CI client-bundle secret scan passes on the deployed UI: **no** Cosmos, JWT,
  mail or ServiceNow credential is present in `dist/apps/ui`.
- **SC-003**: After the migration to Cosmos DB, reconciliation reports **zero data loss and zero
  broken references** (the existing `SC-003`), and a re-run is idempotent.
- **SC-004**: The booking read, the `{city, property}` unique rule and the client search return the
  same results on Cosmos DB as on `mongod` for the same data.
- **SC-005**: A ServiceNow failure (unconfigured, timeout, non-2xx) surfaces as a `502` and never
  loses the triggering action silently.
- **SC-006**: Rolling back a release is possible by re-deploying the previous image tag (App
  Service revision or a previous SHA tag) without a code change.

## Assumptions

- The Azure subscription, resource group, region and naming are provided by the operator; the plan
  names placeholders and does not invent a subscription.
- The Cosmos DB **MongoDB API** is the chosen API (not the SQL/Core API, not Gremlin).
- ServiceNow is reachable from the App Service (SaaS endpoint, or on-prem via VNet integration —
  an open question).
- The images built by the existing Dockerfiles are the deployment units; no new runtime is
  introduced.
- `main` is the release branch; `dev` (if used) deploys to a non-production slot/environment.

## Open Questions

1. **Cosmos tier: RU-based (serverless/provisioned) or vCore?** RU-based is cheaper and scales to
   zero but constrains unique indexes (empty-collection creation) and scans on case-insensitive
   `$regex`. vCore is a real MongoDB (5.0–7.0) and supports everything, at a higher floor cost.
   **Resolution**: a spike (T0xx) against a real account, recording which of the repo's features
   break. The plan recommends **vCore** for fidelity, with RU-based documented as the cheaper
   alternative.
2. **What does "the FE can call ServiceNow" mean?** The clarification records the secure reading
   (FE → backend → ServiceNow). If the intent was a direct browser call, that conflicts with
   `SC-007` and needs an explicit decision to relax it.
3. **Is ServiceNow SaaS or on-prem?** If on-prem, the App Service needs VNet integration / a
   private endpoint for the outbound call.
4. **App Service plan tier and slots?** A Basic plan has no staging slots; a Standard plan does,
   which enables warm swap and easy rollback.
5. **Custom domain and TLS?** Whether the platform is served on a SISK host name, and who owns the
   certificate.
6. **Region and data residency?** The municipality's data is personal data; the region choice is a
   compliance decision.
7. **Who calls ServiceNow, and under which role?** Public contact form, staff, or both — this sets
   the route's `@Roles`.
