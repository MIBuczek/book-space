# Feature Specification: Azure Deployment (Cosmos DB, App Services, Internal Backend)

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

1. The **runtime database** becomes **Azure Cosmos DB for MongoDB**, and the migration tool
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

### Session 2026-11-08

- Q: "BE service should be internal and just FE can call it" — what does "internal" mean? →
  **A: the backend is not publicly reachable.** It is exposed on a **private endpoint** inside an
  Azure virtual network with public network access disabled; the frontend app is the only caller,
  reaching it through **VNet integration**. The browser calls the frontend (same origin `/api`),
  and the frontend proxies to the backend. This is the reading the requirement supports and it is
  recorded as open question 1 in case a lighter option (access restrictions by the frontend's
  outbound IP) is preferred.
- Q: Which Cosmos DB API? → **A: the MongoDB API** (`*.mongo.cosmos.azure.com`), so the driver and
  `DB_URI` stay as they are. The tier (RU-based vs vCore) is an open question resolved by a spike.

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
- **A private backend and the deployment's own checks.** The release workflow's post-deploy smoke
  test cannot reach a private API from the public internet; it must run from inside the VNet (or
  from the frontend), or the check must target the frontend's proxied path.
- **A private backend and the migration.** If Cosmos is also private, the migration run needs VNet
  access (a job with VNet integration, or a temporary operator-IP rule).
- **Sharded vs unsharded.** A sharded Cosmos collection makes every unique index compound with the
  shard key. The collections are small; the plan defaults to **unsharded** unless a volume
  threshold is crossed.
- **App Service plan tier.** A private endpoint needs **Basic or higher**; slots (for warm swap)
  need Standard or higher. The tier is an open question.
- **Secret rotation.** The Cosmos connection string is rotated by updating the App Service setting
  (or Key Vault), not by rebuilding the image.

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
- **FR-015**: The Cosmos compatibility constraints (unique-index creation order, single-collection
  transactions, `$regex` scan behaviour) MUST be honoured and recorded.

### Key Entities *(include if feature involves data)*

- **Container image** — one per app (`book-space-server`, `book-space-ui`), tagged by commit SHA,
  stored in ACR, pulled by an App Service.
- **App Service** — a Linux web app running one image, with app settings and a managed identity.
- **Virtual network** — holds the backend's **private endpoint** subnet and the frontend's **VNet
  integration** subnet (they must be different subnets), plus the private DNS zone link.
- **Release workflow** — the GitHub Actions job that builds, pushes and deploys on `main`.
- **Cosmos DB account** — the MongoDB-API account holding the `book_space` database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merge to `main` results in both applications serving the new revision with **zero
  manual steps** and **no stored Azure credential** in the repository.
- **SC-002**: The CI client-bundle secret scan passes on the deployed UI: **no** Cosmos, JWT or
  mail credential is present in `dist/apps/ui`.
- **SC-003**: After the migration to Cosmos DB, reconciliation reports **zero data loss and zero
  broken references** (the existing `SC-003`), and a re-run is idempotent.
- **SC-004**: The booking read, the `{city, property}` unique rule and the client search return the
  same results on Cosmos DB as on `mongod` for the same data.
- **SC-005**: A request to the backend's public host name from the public internet **does not
  reach the application**; the same request through the frontend succeeds.
- **SC-006**: Rolling back a release is possible by re-deploying the previous image tag (App
  Service revision or a previous SHA tag) without a code change.

## Assumptions

- The Azure subscription, resource group, region and naming are provided by the operator; the plan
  names placeholders and does not invent a subscription.
- The Cosmos DB **MongoDB API** is the chosen API (not the SQL/Core API, not Gremlin).
- The frontend app remains the public surface; the users' browsers reach it directly.
- The images built by the existing Dockerfiles are the deployment units; no new runtime is
  introduced.
- `main` is the release branch; `dev` (if used) deploys to a non-production slot/environment.

## Open Questions

1. **How private is the backend?** The plan recommends a **private endpoint with public access
   disabled** (FR-008). A lighter alternative is **access restrictions** that allow only the
   frontend's outbound IP addresses; it is cheaper but weaker (a shared App Service outbound IP is
   not a strong boundary). Confirm which.
2. **Cosmos tier: RU-based (serverless/provisioned) or vCore?** RU-based is cheaper and scales to
   zero but constrains unique indexes (empty-collection creation) and scans on case-insensitive
   `$regex`. vCore is a real MongoDB (5.0–7.0) and supports everything, at a higher floor cost.
   **Resolution**: a spike (T100/T101) against a real account, recording which of the repo's
   features break. The plan recommends **vCore** for fidelity.
3. **Is Cosmos private too?** If the database is behind a private endpoint, the migration run and
   any operator tool need VNet access. If it is public (firewall-restricted), the migration can run
   from a workstation.
4. **App Service plan tier and slots?** A private endpoint needs **Basic+**; warm-swap slots need
   **Standard+**. This sets cost and the rollback story.
5. **Custom domain and TLS?** Whether the platform is served on a SISK host name, and who owns the
   certificate.
6. **Region and data residency?** The municipality's data is personal data; the region choice is a
   compliance decision.
