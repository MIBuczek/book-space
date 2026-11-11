# Feature Specification: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

**Feature Branch**: `003-azure-deployment`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Review the issue which stays, I want to make migration not to Firebase
but to Azure Cosmos DB. Also I want to have for backend and frontend Azure App Services and a
container registry connected to a GitHub job. BE service should be internal and just FE can call
it. Prepare plan for this."

## Context

`specs/001-booking-platform-rewrite/` defines the application: an Angular UI and a NestJS API over
MongoDB, deployed as two containers behind a reverse proxy (README § Deployment). The remaining
open task is **#47 (T043)** — "execute the migration, reconcile and sign off" — whose target today
is a self-managed MongoDB reached through `DB_URI`.

This feature changes three things, and nothing else:

1. The **runtime database** becomes **Azure DocumentDB** (the MongoDB-compatible vCore
   service), and the migration tool
   (`tools/migration`) writes into it. `DB_URI` remains the single configuration seam, so the API
   code is unchanged; only the deployment and the migration target move.
2. The two containers are hosted on **Azure App Service (Linux, containers)** with images in
   **Azure Container Registry (ACR)**, built and released by a **GitHub Actions** job.
3. The **backend is internal**: it is not reachable from the public internet, and **only the
   frontend can call it**. The frontend is the public surface; it reaches the backend over a
   private network path.

The application's behaviour (contracts, authorisation, domain rules) does not change. This is a
deployment feature, not a rewrite.

## Clarifications

### Session 2026-11-08 (round 1)

- Q: "BE service should be internal and just FE can call it" — what does "internal" mean? →
  **A: the backend is not publicly reachable.** It is exposed on a **private endpoint** inside an
  Azure virtual network with public network access disabled; the frontend app is the only caller,
  reaching it through **VNet integration**. The browser calls the frontend (same origin `/api`),
  and the frontend proxies to the backend.
- Q: Which Cosmos DB API? → **A: the MongoDB API**, so the driver and `DB_URI` stay as they are.

### Session 2026-11-08 (round 2 — the five answers)

All five open questions are answered; they are decisions now, not open items.

1. **How private is the backend?** → **Private endpoint** (public access disabled). Not the
   lighter IP access-restriction variant.
2. **Cosmos tier?** → **vCore**. Note: vCore is now its own service, **Azure DocumentDB**
   (`Microsoft.DocumentDB/mongoClusters`), formerly "vCore-based Azure Cosmos DB for MongoDB". It
   is a real MongoDB (wire protocol 5.0–8.0), so the RU-based constraints (unique index only on an
   empty collection; a case-insensitive `$regex` scan) **do not apply**, and `explain()` works as
   on `mongod`.
3. **Is the database private too?** → **Yes.** Azure DocumentDB gets a **private endpoint** with
   public access disabled, reached over Private Link. Consequence: the migration run needs VNet
   access (a VNet-joined job or a jump box), not a workstation.
4. **App Service plan tier and slots?** → **Yes** — a plan with deployment slots, so the tier is
   **Standard or higher** (PremiumV3 recommended for production). The private endpoint needs
   Basic+, which this satisfies.
5. **Custom domain and TLS, and region?** → **Yes** — the frontend is served on a **custom
   domain** with a **TLS certificate** (an App Service managed certificate). The **region** is the
   operator's choice for data residency; the plan defaults to **Poland Central** (the
   municipality is SISK, Siechnice) and records it as a parameter, not a hard-coded value.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy both applications to Azure from a merge to `main` (Priority: P1)

A maintainer merges a change to `main`. A GitHub Actions job builds the two container images,
pushes them to Azure Container Registry, and updates both Azure App Services so the new revision
is live — with no manual step and no long-lived Azure credential stored in the repository.

**Why this priority**: it is the whole point of the request. Without it there is no deployment.

**Independent Test**: merge a trivial change to `main`; the workflow completes, and the UI and API
respond. Re-running the workflow deploys the same commit idempotently.

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

### User Story 2 - Run the booking platform on Azure DocumentDB (Priority: P2)

The runtime database is Azure DocumentDB. The API connects with the same `DB_URI` contract;
the migration tool (T043, #47) writes the legacy data into it and reconciles.

**Why this priority**: it is the data half of the deployment. It can be done after the compute
move, and it is the riskiest because of DocumentDB compatibility limits.

**Independent Test**: point `DB_URI` at a DocumentDB cluster, boot the API, and run the existing
integration suites against it (or a representative subset); the booking read, the unique
`{city, property}` facility key and the client search all behave as on a real `mongod`.

**Acceptance Scenarios**:

1. **Given** an empty DocumentDB database, **When** the reference seed and the migration run, **Then**
   the twelve facilities, clients, users and bookings are present and every booking's `clientId`
   and `place` resolve (`SC-003`).
2. **Given** the `{city, property}` unique rule, **When** a second facility with the same key is
   inserted, **Then** the write is refused (the unique index is enforced on DocumentDB).
3. **Given** a public or staff booking search, **When** the search term is used, **Then** it
   returns the same rows as on `mongod`.
4. **Given** the migration is re-run, **When** it completes, **Then** it is idempotent and the
   reconciliation counts are unchanged.

---

### User Story 3 - The backend is internal, and only the frontend can call it (Priority: P2)

The backend API is **not reachable from the public internet**. It is exposed on a private
endpoint inside the deployment's virtual network, and the frontend — the only caller — reaches it
through VNet integration. A user's browser talks to the frontend on a public host name; the
frontend proxies `/api` to the private backend. A request to the backend from the internet does
not connect at all.

**Why this priority**: it is an explicit requirement, and it is a security control: it removes the
API's public attack surface (the abuse the rewrite's rate limiting and validation guard against)
without changing a line of the API's own auth code. It sits beside US2 because both are the
"deployment topology" half of the feature.

**Independent Test**: from a machine outside the virtual network,
`curl https://<api-host>/api/buildings` **fails to connect** (public access disabled); from the
browser, the UI loads and its API calls succeed. The same `curl` from inside the VNet (or from the
frontend) succeeds.

**Acceptance Scenarios**:

1. **Given** the backend App Service, **When** it is deployed, **Then** public network access is
   **disabled** and it has a **private endpoint** in the virtual network.
2. **Given** the frontend App Service, **When** a user loads the site, **Then** the browser calls
   the frontend's own origin and the frontend proxies `/api` to the backend over the private path.
3. **Given** the frontend's VNet integration, **When** it calls the backend's private host name,
   **Then** DNS resolves through the linked **private DNS zone** (not a public record).
4. **Given** a request to the backend's public host name from the internet, **When** it is made,
   **Then** it does not reach the application.
5. **Given** the API's existing guards (`AuthGuard('jwt')`, `RolesGuard`, the public
   `OptionalJwtAuthGuard` routes), **When** the backend is made private, **Then** they behave
   exactly as before — the network control is **additional**, not a replacement.
6. **Given** the deployment is recreated from code, **When** the infra is applied, **Then** the
   private endpoint, the DNS zone and the access restrictions are all part of it (no manual
   portal step).

---

### Edge Cases

- **Azure DocumentDB compatibility.** vCore is 99.03 % MongoDB-compatible; the small set of
  unsupported administrative operators is assessed in the Phase 0 spike (the migration extension's
  compatibility assessment). The repo's own features — unique indexes, `explain()`, aggregation —
  are supported.
- **A private database and the migration.** With Azure DocumentDB behind a private endpoint, the
  migration run needs VNet access (a VNet-joined job or a jump box), not a workstation. The runbook
  owns this.
- **A private backend and the deployment's own checks.** The release workflow's post-deploy smoke
  test cannot reach a private API from the public internet; it goes through the frontend's proxied
  path (one request proves the whole chain).
- **Two private endpoints, two DNS zones.** The backend app and the database each have a private
  endpoint with its own private DNS zone (`privatelink.azurewebsites.net` and
  `privatelink.mongocluster.cosmos.azure.com`). The frontend's VNet integration resolves both; a
  missing zone link is the classic "it works from the portal but not from the app" failure.
- **Sharded vs unsharded.** Most DocumentDB workloads need no sharding below multiple terabytes.
  The collections are small; the plan starts **unsharded**.
- **Deployment slots and the private endpoint.** A slot is a separate app with its own private
  endpoint (they cannot be shared). The plan either provisions a slot endpoint per environment or
  deploys slot-less; this is a Phase 1 decision recorded in the params file.
- **Custom domain and certificate.** The managed certificate needs the DNS record to be in place
  and the domain verified before it issues; a stuck certificate is almost always a DNS
  propagation issue, not an App Service one.
- **Secret rotation.** The DocumentDB connection string is rotated by updating the App Service
  setting (or Key Vault), not by rebuilding the image.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The runtime database MUST be **Azure DocumentDB (MongoDB-compatible vCore)**,
  addressed through the existing `DB_URI` connection-string contract, with no change to the API's
  data-access code. (vCore was formerly "vCore-based Azure Cosmos DB for MongoDB".)
- **FR-002**: The migration tool (`tools/migration`) MUST write into the database through the same
  `--target` connection string it already accepts, with no code change beyond what the
  compatibility assessment requires.
- **FR-002a**: The database MUST be reachable **only privately** — a **private endpoint** with
  public access disabled. The migration and any operator tool therefore need VNet access.
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
- **FR-008**: The **backend MUST NOT be reachable from the public internet.** Its public network
  access MUST be disabled and it MUST be exposed only through a **private endpoint** inside the
  deployment's virtual network.
- **FR-009**: The **frontend MUST be the only caller** of the backend, reaching it through **VNet
  integration** and a linked **private DNS zone**; the frontend remains the public surface.
- **FR-010**: The frontend MUST continue to serve the browser on one origin, proxying `/api` to the
  backend, so the browser never addresses the backend directly and **no CORS exception is needed**.
- **FR-011**: Making the backend private MUST NOT change its HTTP contract or its authorisation:
  the existing guards remain the enforcement, and the network control is **additional**.
- **FR-012**: The private networking MUST be **infrastructure as code** — the VNet, subnets, the
  private endpoint, the private DNS zone and the access restrictions are all deployed from the
  repository, with no manual portal step.
- **FR-013**: The existing **CI gate** (lint, unit tests, build, secret scan) MUST remain the merge
  gate; deployment MUST be a **separate** workflow triggered on `main`, so a red build cannot
  deploy.
- **FR-014**: The release MUST be **reversible**: re-deploying a previous image tag restores the
  previous revision without a code change.
- **FR-015**: The deployment MUST use an App Service plan with **deployment slots** (Standard or
  higher; PremiumV3 recommended), so a release can swap warm and roll back without downtime.
- **FR-016**: The frontend MUST be served on a **custom domain over TLS** (an App Service managed
  certificate), with the DNS record and the certificate part of the infrastructure as code.
- **FR-017**: The **region** MUST be a deployment parameter (default **Poland Central**), not a
  hard-coded value, so the data-residency choice is explicit.
- **FR-018**: The Azure DocumentDB **compatibility assessment** (the migration extension) MUST be
  run before the migration, and any unsupported operator it reports MUST be resolved or recorded
  as an accepted deviation.

### Key Entities *(include if feature involves data)*

- **Container image** — one per app (`book-space-server`, `book-space-ui`), tagged by commit SHA,
  stored in ACR, pulled by an App Service.
- **App Service** — a Linux web app running one image, with app settings and a managed identity.
- **Virtual network** — holds the backend's **private endpoint** subnet and the frontend's **VNet
  integration** subnet (they must be different subnets), plus the private DNS zone link.
- **Release workflow** — the GitHub Actions job that builds, pushes and deploys on `main`.
- **Azure DocumentDB cluster** — the MongoDB-compatible cluster holding the `book_space` database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merge to `main` results in both applications serving the new revision with **zero
  manual steps** and **no stored Azure credential** in the repository.
- **SC-002**: The CI client-bundle secret scan passes on the deployed UI: **no** database, JWT
  or mail credential is present in `dist/apps/ui`.
- **SC-003**: After the migration to Azure DocumentDB, reconciliation reports **zero data loss and zero
  broken references** (the existing `SC-003`), and a re-run is idempotent.
- **SC-004**: The booking read, the `{city, property}` unique rule and the client search return the
  same results on Azure DocumentDB as on `mongod` for the same data.
- **SC-005**: A request to the backend's public host name from the public internet **does not
  reach the application**; the same request through the frontend succeeds.
- **SC-006**: Rolling back a release is possible by re-deploying the previous image tag (App
  Service revision or a previous SHA tag) without a code change.

## Assumptions

- The Azure subscription, resource group and naming are provided by the operator; the plan names
  placeholders and does not invent a subscription. The **region is a parameter** (FR-017), default
  Poland Central.
- The **MongoDB-compatible API** is the chosen API (Azure DocumentDB / vCore), not the SQL/Core API
  and not Gremlin.
- The frontend app remains the public surface; the users' browsers reach it directly on the custom
  domain.
- The images built by the existing Dockerfiles are the deployment units; no new runtime is
  introduced.
- `main` is the release branch; a non-production environment deploys to a **slot**.

## Decisions (all previously-open questions are answered)

| # | Question | Decision |
|---|----------|----------|
| 1 | How private is the backend? | **Private endpoint**, public access disabled (FR-008) |
| 2 | Database tier? | **Azure DocumentDB (vCore)** — real MongoDB, so the RU-based constraints do not apply |
| 3 | Is the database private too? | **Yes** — private endpoint + Private Link (FR-002a) |
| 4 | App Service plan and slots? | **Standard or higher** (PremiumV3 recommended), with **deployment slots** (FR-015) |
| 5 | Custom domain, TLS and region? | **Custom domain + managed TLS certificate** (FR-016); **region is a parameter**, default Poland Central (FR-017) |

**Consequence of decision 2**: because the tier is vCore, the two RU-based constraints that shaped
the first draft of this plan (unique index only on an empty collection; a case-insensitive `$regex`
collection scan) **no longer apply**. The migration ordering still creates collections and indexes
before data as good practice, but it is no longer a hard requirement, and the search does not need
a scan workaround. `explain()` works as on `mongod`, so the index tests' intent carries over.

**Consequence of decision 3**: the migration cannot run from an arbitrary workstation. It runs from
a VNet-joined job (a Container Apps Job with VNet integration, an Azure VM jump box, or a temporary
firewall rule for the operator's IP — the last only for a short, recorded window).
