# Feature Specification: Dependency and Runtime Modernization

**Feature Branch**: `002-dependency-modernization`

**Created**: 2026-10-27

**Status**: Draft

**Input**: "I want to make project updates to the latest version, can you plan this?"

## Why

`book-space` is pinned to a stack that is two to three years behind current
releases: Nx 16.1.2, Angular 16.0, NestJS 9.1, Mongoose 7.1, TypeScript 5.0.2,
ESLint 8.15, Jest 29.4, Cypress 12.11, Node 18. The last release on each of these
lines, from the npm registry:

| Line | Last release | Date |
|------|--------------|------|
| Angular 16 | 16.2.12 | 2023-11-02 |
| Nx 16 | 16.10.0 | 2023-10-04 |
| NestJS 9 | 9.4.3 | 2023-06-12 |
| TypeScript 5.0 | 5.0.4 | 2023-04-07 |
| Jest 29 | 29.7.0 | 2023-09-12 |
| ESLint 8 | 8.57.1 | 2024-09-16 |
| Node 18 | 18.20.8 | 2025-03-28 |

Node 18 reached end-of-life on 30 April 2025. Angular 16 has been out of support
since November 2024; under Angular's six-months-active plus twelve-months-LTS policy
the oldest still-supported line is Angular 20. ESLint 8 and Jest 29 have both been
superseded by two majors. These lines are no longer receiving fixes for newly
disclosed vulnerabilities.

One exception worth stating plainly: **Mongoose 7.8.13 was published on 2026-10-23**,
so the Mongoose 7 line is still receiving maintenance releases. The Mongoose upgrade
is therefore driven by the NestJS upgrade (which requires `@nestjs/mongoose` 11),
not by Mongoose 7 being abandoned.

The window to do this cheaply is now. `apps/ui` is still the Nx starter shell (65
lines, no feature code) and `apps/server` is 1851 lines across 6 controllers. The
cost of an Angular 16→22 migration is roughly proportional to how much component
code exists, and today almost none does. Waiting until after the feature UI is
built multiplies this work.

## What "latest" can and cannot mean

Three constraints make a literal "upgrade everything to latest" impossible. They
are properties of the upstream packages, not of this repository:

1. **Angular 22 requires TypeScript `>=6.0 <6.1`.** TypeScript 7.0.2 exists and is
   the latest, but Angular 22 will not accept it. `ts-jest` 29 likewise peers
   `typescript >=4.3 <7`. The TypeScript target is therefore 6.0.3, not 7.0.2.

2. **Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26.0.0`.** CI and both
   Dockerfiles pin Node 18. Node 18 cannot run Angular 22 at all.

3. **`@nx/nest` requires `@nestjs/core >=10 <12`.** NestJS 12.3.2 is the latest, but
   the Nx Nest plugin does not support it. The NestJS target is therefore 11.2.8
   unless `@nx/nest` is dropped, which is a decision (see FR-014).

A fourth constraint affects sequencing rather than the target:

4. **Nx 24 removed the `jest`, `eslint` and `webpack` executors** that this
   repository's `project.json` files depend on. `@nx/jest@24`, `@nx/eslint@24` and
   `@nx/cypress@24` ship an empty `executors` map; `@nx/webpack@24` retains only
   `ssr-dev-server`. Nx 24 expects inference plugins instead. This is the single
   most invasive change in the whole upgrade and it is avoidable by targeting Nx
   23.3.1, which still ships every executor this repo uses.

## Target state

| Component | Current | Target | Note |
|-----------|---------|--------|------|
| Node | 18 (CI, Docker) | 24 LTS | Angular 22 floor |
| Nx | 16.1.2 | **23.3.1** | 24 removes needed executors |
| Angular | 16.0 | 22.2.3 | latest |
| TypeScript | 5.0.2 | **6.0.3** | 7.0.2 rejected by Angular 22 |
| NestJS | 9.1 | **11.2.8** | 12.3.2 rejected by `@nx/nest` |
| Mongoose | 7.1 | 9.11.4 | via `@nestjs/mongoose` 11 |
| Jest | 29.4 | 30.5.2 | |
| ESLint | 8.15 | 10.13.0 | 9.17 lands in Stage 1; flat config in Stage 5 |
| Cypress | 12.11 | 16.2.0 | |
| yarn | 1 (lockfile v1) | 1 | unchanged; out of scope |

`@nx/angular@23.3.1` peers `@angular/build >=20 <23`, so Angular 22.2.3 is in
range. `@nx/nest@23.3.1` peers `@nestjs/core >=10 <12`, so NestJS 11.2.8 is in
range. Every chosen version is mutually consistent.

## User Scenarios & Testing

### User Story 1 — Supportable dependency baseline (P1)

As a maintainer, I need every dependency to be on a supported release line, so that
security patches are available and the application is not running known-vulnerable
code.

**Acceptance**: `yarn nx run-many --target=lint --all`, `--target=test` and
`--target=build` all pass on the target versions, with no dependency resolving to a
version outside its supported range.

### User Story 2 — Upgrade without breaking behaviour (P1)

As a maintainer, I need the API to behave identically after the upgrade, so that the
existing contract holds and the rewrite work is not invalidated.

**Acceptance**: all 21 existing unit tests pass unchanged; the 24 HTTP endpoints
answer with the same shapes, status codes and payloads as before the upgrade.

### User Story 3 — Repeatable, staged migration (P2)

As a maintainer, I need the upgrade split into independently verifiable steps that
each land green, so that a failure can be attributed to one version jump rather than
to the whole migration.

**Acceptance**: each stage in the plan lands as its own pull request with CI green,
and the application starts successfully at every stage boundary.

### User Story 4 — Frontend ready for feature work (P2)

As a developer, I need the Angular app on 22 and building with the current builder,
so that the feature UI is written against a supported framework rather than one that
is already end-of-life.

**Acceptance**: `yarn nx build ui --configuration=production` succeeds using
`@angular/build:application`, and `yarn nx serve ui` starts and renders the shell.

## Functional Requirements

- **FR-001** The repository MUST build, lint and test on the target versions in the
  table above.
- **FR-002** Node MUST be pinned consistently across CI, both Dockerfiles, and a new
  `.nvmrc`. A single source of truth for the Node major MUST be introduced.
- **FR-003** `package.json` MUST declare `engines.node` and `packageManager`, so that
  a wrong runtime fails loudly instead of producing confusing build errors.
- **FR-004** The `nx-cloud` dependency MUST be removed. `AGENTS.md` already forbids
  reintroducing a cloud token; shipping the client without a token serves no purpose.
- **FR-005** `npmScope` MUST be removed from `nx.json`; it was dropped from the Nx
  schema in v17.
- **FR-006** The Angular UI build MUST migrate from
  `@angular-devkit/build-angular:browser` to `@angular/build:application`, and
  `browserTarget` MUST become `buildTarget` in the dev-server target.
- **FR-007** The `@nx/linter:eslint` executor MUST become `@nx/eslint:lint`.
- **FR-008** ESLint MUST be upgraded to 9 in Stage 1 (a hard prerequisite of
  `@nx/eslint@23`, which refuses to run on ESLint 8) and MUST migrate from
  `.eslintrc.json` to flat config (`eslint.config.js`) in Stage 5. Until flat config
  lands, Nx runs ESLint in eslintrc mode because a root `.eslintrc.json` is present.
- **FR-009** The UI test setup MUST migrate from `jest-preset-angular/setup-jest`
  (removed in v17) to the supported setup entry point.
- **FR-010** The Mongoose `pre('save')` hook in `user.schema.ts` MUST be updated for
  Mongoose 9 semantics, and password hashing MUST be covered by a test that proves
  the hash is produced exactly once per save.
- **FR-011** Route parameters declared as `@Delete('_id')` MUST become `@Delete(':_id')`.
  These are latent defects that become visible under Express 5 (shipped by
  `@nestjs/platform-express` 11).
- **FR-012** The upgrade MUST be executed as the staged sequence in `plan.md`, one
  pull request per stage, each green before the next begins.
- **FR-013** No behavioural change to the HTTP contract is permitted by this feature.
  Contract changes belong to `001-booking-platform-rewrite`.
- **FR-014** The NestJS major MUST be decided explicitly: stay on 11.2.8 with
  `@nx/nest` supported, or move to 12.3.2 and drop `@nx/nest`. `@nx/nest` is
  currently referenced only by generators, never by a `project.json`, so dropping it
  is viable but removes scaffolding support.

## Non-Functional Requirements

- **NFR-001** Each stage MUST leave the repository deployable; no stage may require
  the next to be usable.
- **NFR-002** The lockfile MUST be regenerated once per stage and committed, so that
  a bisect points at one dependency set.
- **NFR-003** The CI gate from PR #60 MUST remain the required check throughout. A
  stage that cannot pass the existing gate does not merge.
- **NFR-004** Docker images MUST build and start after Stage 1 and after Stage 5.
- **NFR-005** The upgrade MUST NOT introduce a cloud cache or build dependency that
  requires a token.

## Out of Scope

- Feature work from `001-booking-platform-rewrite` (the feature UI, reporting,
  notifications, migration tool).
- Migrating yarn 1 → 3/4 and lockfile v1 → v2. Separate concern with its own risk.
- Adopting zoneless change detection, standalone-by-default migrations, or Angular
  signals. These are opportunities created by the upgrade, not part of it.
- `@nx/cypress` 24 and Nx 24 itself, deferred to a follow-up (FR-014 rationale).

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Angular 16→22 spans six majors with three breaking config formats | Build breaks in ways `nx migrate` does not fix | Stage one major at a time; keep the CI gate required |
| Nx 24 executor removal discovered late | Would invalidate the plan | Already scoped; target Nx 23.3.1 and defer 24 |
| NestJS 9→11 pulls Express 5 | Route and middleware behaviour changes | Only 24 endpoints, no wildcard/regex routes; covered by US2 |
| Mongoose 7→9 changes hook semantics | Passwords could be double-hashed or not hashed | FR-010 requires a dedicated test before and after |
| Node 18 → 24 changes native module builds | `bcrypt` is a native addon | Verify `bcrypt` 6.0.0 loads on Node 24; it has prebuilt binaries |
| Long-lived branch diverges from feature work | Painful rebase | Do this before feature UI work starts; it is cheap now and expensive later |

## Success Criteria

- **SC-001** All 21 existing unit tests pass on the target versions with no test
  modified to accommodate a dependency change.
- **SC-002** Lint, test, build and the secret scan all pass on the target versions.
- **SC-003** `node -v` in CI, both Dockerfiles and `.nvmrc` agree.
- **SC-004** No dependency in `yarn why` output resolves outside its declared
  supported range.
- **SC-005** `yarn nx build ui --configuration=production` uses
  `@angular/build:application` and produces `dist/apps/ui/index.html`.
- **SC-006** The server starts with a valid `.env` and the env validation from PR #61
  still fails fast with an invalid one.
