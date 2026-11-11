# Tasks: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

**Input**: Design documents from `specs/003-azure-deployment/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Organization**: tasks are grouped by user story so each can be implemented and verified
independently. `[P]` marks tasks that can run in parallel (different files, no dependency).

**Decisions already made** (spec § Decisions): private endpoint for the backend; **Azure
DocumentDB** (vCore) for the database; the database is **private** too; the App Service plan has
**slots**; the frontend is on a **custom domain with TLS**; the region defaults to **Poland
Central**. These are inputs, not tasks.

**Path conventions**: infra in `infra/`, workflows in `.github/workflows/`, docs in `docs/`.

## Phase 0 — Compatibility and cost spike

**Purpose**: prove the platform against a real Azure DocumentDB cluster before committing infra.

- [ ] **T100** Create an **Azure DocumentDB** cluster (Poland Central, smallest tier). Run the
      **compatibility assessment** (FR-018) on the legacy export and record every unsupported
      operator.
- [ ] **T101** Run `ensure-collections`, the seed and the migration against the cluster; boot the
      API against it; record the results and the search/`explain` timings.
- [ ] **T102** Record the spike in `research.md` (append a "Spike results" note) and adjust any
      assumption the evidence contradicts.

## Phase 1 — Network and infrastructure as code (User Story 3 + User Story 2)

**Purpose**: the Azure resources, including the private topology. Independently testable:
`az deployment` succeeds and the resources exist.

- [ ] **T110** `infra/bicep/main.bicep` + `modules/`: registry, App Service plan (**Standard+**,
      slots), two web apps, user-assigned identities, the DocumentDB cluster, the network.
- [ ] **T111** [P] `infra/bicep/modules/network.bicep`: the VNet and its subnets
      (`snet-fe-integration` delegated to `Microsoft.Web/serverFarms`, `snet-pe-backend`,
      `snet-pe-database`), and the two private DNS zones (`privatelink.azurewebsites.net`,
      `privatelink.mongocluster.cosmos.azure.com`) with their VNet links.
- [ ] **T112** [P] `infra/bicep/modules/private-endpoint.bicep`: the backend's private endpoint and
      `publicNetworkAccess: Disabled` (FR-008), and the **database's** private endpoint with public
      access disabled (FR-002a).
- [ ] **T113** [P] `infra/bicep/modules/app-service.bicep`: the frontend's VNet integration on the
      integration subnet (FR-009); `API_UPSTREAM` = the backend's private host name; the **staging
      slot** (FR-015); the **custom domain + managed certificate** (FR-016).
- [ ] **T114** [P] `infra/bicep/modules/identity.bicep`: the `AcrPull` role assignment and the
      **federated credential** for GitHub OIDC.
- [ ] **T115** [P] `infra/bicep/modules/documentdb.bicep`: the `Microsoft.DocumentDB/mongoClusters`
      cluster, the `book_space` database and the collections (research R1/R2).
- [ ] **T116** `infra/scripts/ensure-collections.ts`: idempotently create the collections and the
      indexes in `data-model.md` § 2. Add its Nx target.
- [ ] **T117** A test for `ensure-collections.ts` against `mongodb-memory-server` (proves it is
      idempotent and creates every index).
- [ ] **T118** [P] `infra/bicep/params/dev.bicepparam`, `prod.bicepparam`: region (default Poland
      Central — FR-017), tier, host name, custom domain.

## Phase 2 — Release workflow (User Story 1)

**Purpose**: build → push → deploy to a slot → swap, with no stored secret. Independently
testable: a merge deploys both apps.

- [ ] **T120** `.github/workflows/release.yml`: on `push: main`, build both images, push to ACR
      tagged `:<sha>` and `:main`.
- [ ] **T121** The OIDC login step (`azure/login` with `id-token: write`); **no** stored secret
      (FR-005, research R5).
- [ ] **T122** [P] Deploy to the **staging slot**, then **swap** into production (FR-015).
- [ ] **T123** [P] A post-deploy smoke test **through the frontend** (plan § D7):
      `GET <custom-domain>/api/buildings` returns twelve facilities.
- [ ] **T124** Confirm `ci.yml` is unchanged and remains the merge gate (FR-013).
- [ ] **T125** Document rollback (slot swap, or re-deploy a previous SHA tag) in `README.md` §
      Deployment and `docs/operations.md` (SC-006).

## Phase 3 — Migration into Azure DocumentDB (User Story 2)

**Purpose**: run T043 (#47) against the cluster. Depends on Phases 0–1.

- [ ] **T130** Write the migration runbook for a **private database**: a VNet-joined job (Container
      Apps Job recommended) or a jump box (research R11); no workstation run.
- [ ] **T131** Run the migration against staging; reconcile per `SC-003`.
- [ ] **T132** Re-run to prove idempotence; record the counts.
- [ ] **T133** Attach the reconciliation report to #47 and record the sign-off.
- [ ] **T134** Update `docs/operations.md` (T060) with the DocumentDB backup/DR section (PITR,
      research R12) and `README.md` § Deployment.

## Phase 4 — Private-backend verification (User Story 3)

**Purpose**: prove the topology. Independently testable: the four checks in `contracts/network.md`
§ 5.

- [ ] **T140** Verify SC-005: a public request to the backend host name does **not** reach the app.
- [ ] **T141** [P] Verify the frontend's proxied `/api` call succeeds (the whole chain).
- [ ] **T142** [P] Verify a request from inside the VNet succeeds (the private path works).
- [ ] **T143** Verify the database has no public endpoint (a public `mongosh` cannot connect).
- [ ] **T144** Confirm the API's existing guards are unchanged and still enforced (FR-011) — the
      integration specs are the evidence, and no server code was touched.
- [ ] **T145** Confirm the topology is reproducible from Bicep (FR-012): re-apply the deployment
      and the checks still pass.

## Phase 5 — Real-cluster verification suite (User Story 2)

**Purpose**: run the repo's integration behaviour against the real cluster. Opt-in; skipped
without `DB_URI`.

- [ ] **T150** `apps/server/src/testing/documentdb-test-context.ts`: connect to a real cluster from
      env; skip the suite when unset.
- [ ] **T151** [P] `*.documentdb.spec.ts`: the `{city, property}` unique rule is enforced.
- [ ] **T152** [P] `*.documentdb.spec.ts`: the booking read and the client search return the same
      rows as on `mongod`, and `explain()` picks the intended index.

## Phase 6 — Documentation and ops

- [ ] **T160** `AGENTS.md`: the DocumentDB constraints and the private topology (R1–R4), the
      release workflow, the region default.
- [ ] **T161** [P] `README.md` § Deployment: the Azure target, the release workflow, the private
      topology, rollback, the custom domain.
- [ ] **T162** [P] `docs/operations.md`: DocumentDB backup/DR (PITR), the release/rollback runbook,
      and the private-network runbook (how to reach the API and the database for debugging).
- [ ] **T163** Update `specs/001-booking-platform-rewrite/tasks.md` (T043) to note the Azure
      DocumentDB target, and comment on #47.

## Dependencies

- Phase 0 → Phase 1: the spike confirms the tier's behaviour before infra is written.
- Phase 1 (T116) → Phase 3 (T130): the collections/indexes must exist before the migration writes.
- Phase 1 → Phase 2: the App Services, slots and identities must exist before a deploy can target
  them.
- Phase 4 depends on Phases 1–2 (the topology must be deployed).

## Out of scope

- Any change to the HTTP contract, the authorisation model or the domain rules.
- A direct browser→backend call (excluded by US3: the backend is private).
- Sharding the collections (the volume does not warrant it — research R1).
- The RU-based "Azure Cosmos DB for MongoDB" tier (decision 2 chose vCore / Azure DocumentDB).
