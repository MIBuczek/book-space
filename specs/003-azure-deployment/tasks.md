# Tasks: Azure Deployment and ServiceNow Integration

**Input**: Design documents from `specs/003-azure-deployment/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Organization**: tasks are grouped by user story so each can be implemented and verified
independently. `[P]` marks tasks that can run in parallel (different files, no dependency).

**Path conventions**: infra in `infra/`, workflows in `.github/workflows/`, server code in
`apps/server/src/app/`, UI in `apps/ui/src/app/`, shared types in `libs/models/`.

## Phase 0 — Spike (decides the Cosmos tier)

**Purpose**: answer open question 1 with evidence before committing infra. See research R5.

- [ ] **T100** [P] Create a **Cosmos DB for MongoDB (vCore)** account; run `ensure-collections`,
      the seed and the migration against it; record what breaks. (`infra/scripts/ensure-collections.ts`)
- [ ] **T101** [P] Create a **Cosmos DB for MongoDB (RU-based)** account; repeat T100; record the
      unique-index, `$regex` and `explain` differences observed.
- [ ] **T102** Compare T100/T101 and **lock the tier** in `spec.md` open question 1 and
      `research.md` R5. Record the search-cost measurement (research R3).

## Phase 1 — Infrastructure as code (User Story 2)

**Purpose**: the Azure resources. Independently testable: `az deployment` succeeds and the
resources exist.

- [ ] **T110** `infra/bicep/main.bicep` + `modules/`: registry, App Service plan + two web apps,
      user-assigned identities, Cosmos account. (`infra/bicep/`)
- [ ] **T111** [P] `infra/bicep/modules/identity.bicep`: the `AcrPull` role assignment and the
      **federated credential** for GitHub OIDC. (`infra/bicep/modules/identity.bicep`)
- [ ] **T112** [P] `infra/bicep/modules/cosmos.bicep`: the account, the `book_space` database and
      the collections (research R1/R2). (`infra/bicep/modules/cosmos.bicep`)
- [ ] **T113** `infra/scripts/ensure-collections.ts`: idempotently create the collections and the
      indexes in `data-model.md` § 2, **while empty** (research R2). Add its Nx target.
- [ ] **T114** [P] `infra/bicep/params/dev.bicepparam`, `prod.bicepparam`: environment parameters.
- [ ] **T115** A test for `ensure-collections.ts` against `mongodb-memory-server` (proves it is
      idempotent and creates every index).

## Phase 2 — Release workflow (User Story 1)

**Purpose**: build → push → deploy on `main`, with no stored secret. Independently testable: a
merge deploys both apps.

- [ ] **T120** `.github/workflows/release.yml`: on `push: main`, build both images, push to ACR
      tagged `:<sha>` and `:main`. (`.github/workflows/release.yml`)
- [ ] **T121** The OIDC login step (`azure/login` with `id-token: write`); **no** stored secret
      (FR-005, research R6).
- [ ] **T122** [P] Deploy step: update each App Service to the new SHA tag (managed-identity pull).
- [ ] **T123** [P] A post-deploy smoke test (the UI loads; `GET /api/buildings` answers).
- [ ] **T124** Confirm `ci.yml` is unchanged and remains the merge gate (FR-012).
- [ ] **T125** Document rollback (re-deploy the previous SHA tag) in `README.md` § Deployment and
      `docs/operations.md` (SC-006).

## Phase 3 — Migration into Cosmos (User Story 2)

**Purpose**: run T043 (#47) against Cosmos. Depends on Phases 0–1.

- [ ] **T130** Point the migration runbook at Cosmos and enforce the **ordering** (research R2,
      `data-model.md` § 3).
- [ ] **T131** Run the migration against staging; reconcile per `SC-003`.
- [ ] **T132** Re-run to prove idempotence; record the counts.
- [ ] **T133** Attach the reconciliation report to #47 and record the sign-off.
- [ ] **T134** Update `docs/operations.md` (T060) with the Cosmos backup/DR section
      (research R10) and `README.md` § Deployment.

## Phase 4 — Cosmos verification suite (User Story 2)

**Purpose**: prove the features Cosmos treats differently. Opt-in; skipped without `COSMOS_URI`.

- [ ] **T140** `apps/server/src/testing/cosmos-test-context.ts`: connect to a real account from
      env; skip the suite when unset.
- [ ] **T141** [P] `*.cosmos.spec.ts`: the `{city, property}` unique rule is enforced.
- [ ] **T142** [P] `*.cosmos.spec.ts`: the booking read and the client search return the same rows
      as on `mongod` (correctness; the scan cost is recorded, research R3).

## Phase 5 — ServiceNow module (User Story 3)

**Purpose**: the internal integration. Independently testable against a mock ServiceNow.

- [ ] **T150** `env.validation.ts`: the optional `SERVICENOW_*` settings (contracts/servicenow.md
      § 2). (`apps/server/src/app/config/env.validation.ts`)
- [ ] **T151** `servicenow/client/servicenow-client.ts`: the seam, the unconfigured client that
      throws, and the HTTP client with a timeout (mirrors `mail-transport.ts`). Spec first.
      (`apps/server/src/app/servicenow/client/`)
- [ ] **T152** [P] `servicenow/models/servicenow.dto.ts`: `CreateIncidentDto` (a concrete class).
- [ ] **T153** [P] `libs/models/servicenow.model.ts`: `IServiceNowRecord` (shared with the UI).
- [ ] **T154** `servicenow/service/servicenow.service.ts`: resolve the table server-side, map a
      failure to `502`; spec drives the real client against a mock HTTP server.
- [ ] **T155** `servicenow/controller/servicenow.controller.ts`: `POST /api/servicenow/incident`,
      guarded (`AuthGuard('jwt')` + `RolesGuard`, `@Roles` per open question 7), `@HttpCode(201)`.
- [ ] **T156** `servicenow/servicenow.module.ts`: wire it; register in `AppModule`.
- [ ] **T157** An integration spec: `422` on a bad body, `502` unconfigured, `401`/`403` from the
      guards, `201` on success.
- [ ] **T158** [P] `apps/ui/src/app/core/servicenow.api.ts` + the triggering surface; the UI calls
      `/api/servicenow/*` only (FR-008/009).
- [ ] **T159** Confirm `tools/scan-bundle.js` finds no ServiceNow value in `dist/apps/ui`
      (SC-002).

## Phase 6 — Documentation and ops

- [ ] **T160** `AGENTS.md`: the Cosmos constraints (R2/R3/R4), the release workflow, and the
      ServiceNow seam.
- [ ] **T161** [P] `README.md` § Deployment: Azure target, the release workflow, rollback.
- [ ] **T162** [P] `docs/operations.md`: Cosmos backup/DR and the ServiceNow runbook.
- [ ] **T163** Update `specs/001-booking-platform-rewrite/tasks.md` (T043) to note the Cosmos
      target, and comment on #47.

## Dependencies

- Phase 1 (T113) → Phase 3 (T130): the collections/indexes must exist before the migration writes.
- Phase 0 → Phase 1: the tier decision shapes `cosmos.bicep`.
- Phase 5 is independent of Phases 1–4 (it is application code, not infrastructure).

## Out of scope

- Any change to the HTTP contract, the authorisation model or the domain rules.
- A ServiceNow record **stored** locally (a new collection) — a separate decision if wanted.
- Custom domain/TLS and region choice — operator decisions (spec open questions 5–6).
