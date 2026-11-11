# Tasks: Azure Deployment (Cosmos DB, App Services, Internal Backend)

**Input**: Design documents from `specs/003-azure-deployment/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Organization**: tasks are grouped by user story so each can be implemented and verified
independently. `[P]` marks tasks that can run in parallel (different files, no dependency).

**Path conventions**: infra in `infra/`, workflows in `.github/workflows/`, docs in `docs/`.

## Phase 0 — Spike (decides the Cosmos tier)

**Purpose**: answer open question 2 with evidence before committing infra. See research R5.

- [ ] **T100** [P] Create a **Cosmos DB for MongoDB (vCore)** account; run `ensure-collections`,
      the seed and the migration against it; record what breaks. (`infra/scripts/ensure-collections.ts`)
- [ ] **T101** [P] Create a **Cosmos DB for MongoDB (RU-based)** account; repeat T100; record the
      unique-index, `$regex` and `explain` differences observed.
- [ ] **T102** Compare T100/T101 and **lock the tier** in `spec.md` open question 2 and
      `research.md` R5. Record the search-cost measurement (research R3).

## Phase 1 — Network and infrastructure as code (User Story 3 + User Story 2)

**Purpose**: the Azure resources, including the private topology. Independently testable:
`az deployment` succeeds and the resources exist.

- [ ] **T110** `infra/bicep/main.bicep` + `modules/`: registry, App Service plan + two web apps,
      user-assigned identities, Cosmos account, network. (`infra/bicep/`)
- [ ] **T111** [P] `infra/bicep/modules/network.bicep`: the VNet, the two subnets
      (`snet-fe-integration` delegated to `Microsoft.Web/serverFarms`, `snet-pe-backend`), and the
      private DNS zone `privatelink.azurewebsites.net` + its VNet link.
- [ ] **T112** [P] `infra/bicep/modules/private-endpoint.bicep`: the backend's private endpoint and
      the backend app's `publicNetworkAccess: Disabled` (FR-008).
- [ ] **T113** [P] `infra/bicep/modules/app-service.bicep`: the frontend's VNet integration on the
      integration subnet (FR-009); `API_UPSTREAM` = the backend's private host name.
- [ ] **T114** [P] `infra/bicep/modules/identity.bicep`: the `AcrPull` role assignment and the
      **federated credential** for GitHub OIDC.
- [ ] **T115** [P] `infra/bicep/modules/cosmos.bicep`: the account, the `book_space` database and
      the collections (research R1/R2).
- [ ] **T116** `infra/scripts/ensure-collections.ts`: idempotently create the collections and the
      indexes in `data-model.md` § 2, **while empty** (research R2). Add its Nx target.
- [ ] **T117** A test for `ensure-collections.ts` against `mongodb-memory-server` (proves it is
      idempotent and creates every index).
- [ ] **T118** [P] `infra/bicep/params/dev.bicepparam`, `prod.bicepparam`: environment parameters
      (including the App Service plan tier — open question 4).

## Phase 2 — Release workflow (User Story 1)

**Purpose**: build → push → deploy on `main`, with no stored secret. Independently testable: a
merge deploys both apps.

- [ ] **T120** `.github/workflows/release.yml`: on `push: main`, build both images, push to ACR
      tagged `:<sha>` and `:main`. (`.github/workflows/release.yml`)
- [ ] **T121** The OIDC login step (`azure/login` with `id-token: write`); **no** stored secret
      (FR-005, research R7).
- [ ] **T122** [P] Deploy step: update each App Service to the new SHA tag (managed-identity pull).
- [ ] **T123** [P] A post-deploy smoke test **through the frontend** (plan § D7):
      `GET <fe>/api/buildings` returns twelve facilities.
- [ ] **T124** Confirm `ci.yml` is unchanged and remains the merge gate (FR-013).
- [ ] **T125** Document rollback (re-deploy the previous SHA tag) in `README.md` § Deployment and
      `docs/operations.md` (SC-006).

## Phase 3 — Migration into Cosmos (User Story 2)

**Purpose**: run T043 (#47) against Cosmos. Depends on Phases 0–1.

- [ ] **T130** Point the migration runbook at Cosmos and enforce the **ordering** (research R2,
      `data-model.md` § 3); account for a private Cosmos if that is the choice (research R10).
- [ ] **T131** Run the migration against staging; reconcile per `SC-003`.
- [ ] **T132** Re-run to prove idempotence; record the counts.
- [ ] **T133** Attach the reconciliation report to #47 and record the sign-off.
- [ ] **T134** Update `docs/operations.md` (T060) with the Cosmos backup/DR section
      (research R11) and `README.md` § Deployment.

## Phase 4 — Private-backend verification (User Story 3)

**Purpose**: prove the topology. Independently testable: the three checks in `contracts/network.md`
§ 5.

- [ ] **T140** Verify SC-005: a public request to the backend host name does **not** reach the app.
- [ ] **T141** [P] Verify the frontend's proxied `/api` call succeeds (the whole chain).
- [ ] **T142** [P] Verify a request from inside the VNet succeeds (the private path works).
- [ ] **T143** Confirm the API's existing guards are unchanged and still enforced (FR-011) — the
      integration specs are the evidence, and no server code was touched.
- [ ] **T144** Confirm the topology is reproducible from Bicep (FR-012): re-apply the deployment
      and the checks still pass.

## Phase 5 — Cosmos verification suite (User Story 2)

**Purpose**: prove the features Cosmos treats differently. Opt-in; skipped without `COSMOS_URI`.

- [ ] **T150** `apps/server/src/testing/cosmos-test-context.ts`: connect to a real account from
      env; skip the suite when unset.
- [ ] **T151** [P] `*.cosmos.spec.ts`: the `{city, property}` unique rule is enforced.
- [ ] **T152** [P] `*.cosmos.spec.ts`: the booking read and the client search return the same rows
      as on `mongod` (correctness; the scan cost is recorded, research R3).

## Phase 6 — Documentation and ops

- [ ] **T160** `AGENTS.md`: the Cosmos constraints (R2/R3/R4), the private topology (R6) and the
      release workflow.
- [ ] **T161** [P] `README.md` § Deployment: the Azure target, the release workflow, the private
      topology, rollback.
- [ ] **T162** [P] `docs/operations.md`: Cosmos backup/DR, the release/rollback runbook, and the
      private-network runbook (how to reach the API for debugging).
- [ ] **T163** Update `specs/001-booking-platform-rewrite/tasks.md` (T043) to note the Cosmos
      target, and comment on #47.

## Dependencies

- Phase 1 (T116) → Phase 3 (T130): the collections/indexes must exist before the migration writes.
- Phase 0 → Phase 1: the tier decision shapes `cosmos.bicep`.
- Phase 1 → Phase 2: the App Services and identities must exist before a deploy can target them.
- Phase 4 depends on Phases 1–2 (the topology must be deployed).

## Out of scope

- Any change to the HTTP contract, the authorisation model or the domain rules.
- A direct browser→backend call (excluded by US3: the backend is private).
- Custom domain/TLS and region choice — operator decisions (spec open questions 5–6).
- A lighter "access restrictions by IP" variant of US3 (open question 1); the plan implements the
  private endpoint.
