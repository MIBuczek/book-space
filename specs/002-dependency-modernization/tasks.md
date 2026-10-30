# Tasks — Dependency and Runtime Modernization

**Feature**: `002-dependency-modernization` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Each task becomes one GitHub issue. Identifiers are stable and used as the issue-title
prefix (`U001: …`). `[P]` marks a task that can run in parallel with its siblings.
`[S#]` maps the task to its stage in `plan.md`.

All 32 issues are created on `MIBuczek/book-space`:

| Task | Issue | Task | Issue | Task | Issue | Task | Issue |
|------|-------|------|-------|------|-------|------|-------|
| U001 | #62 | U009 | #70 | U017 | #78 | U025 | #86 |
| U002 | #63 | U010 | #71 | U018 | #79 | U026 | #87 |
| U003 | #64 | U011 | #72 | U019 | #80 | U027 | #88 |
| U004 | #65 | U012 | #73 | U020 | #81 | U028 | #89 |
| U005 | #66 | U013 | #74 | U021 | #82 | U029 | #90 |
| U006 | #67 | U014 | #75 | U022 | #83 | U030 | #91 |
| U007 | #68 | U015 | #76 | U023 | #84 | U031 | #92 |
| U008 | #69 | U016 | #77 | U024 | #85 | U032 | #93 |

**Duplicate resolved**: U027 (#88) absorbed `001-booking-platform-rewrite` T024 (#28), which
is now **closed as not planned**. #28 also required renaming the buildings controller's
handlers (all misleadingly named `...Client`) and carrying the `tech-debt` label; both were
folded into #88 before closing, so no requirement was lost. #88 remains in milestone #16.

## Milestones

Each stage is a milestone, so progress is visible per stage rather than as one 32-issue block:

| Milestone | Title | Issues |
|-----------|-------|--------|
| #10 | 002 Stage 0 - Pin and prune (Node 24) | U001–U005 |
| #11 | 002 Stage 1 - Nx 16 to 23.3.1 | U006–U009 |
| #12 | 002 Stage 2 - TypeScript 5.0 to 6.0 | U010–U011 |
| #13 | 002 Stage 3 - Angular 16 to 22 | U012–U016 |
| #14 | 002 Stage 4 - NestJS 9 to 11.2.8 | U017–U020 |
| #15 | 002 Stage 5 - ESLint 10, Jest 30, Cypress 16 | U021–U025 |
| #16 | 002 Code fixes | U026–U027 |
| #17 | 002 Verification and documentation | U028–U032 |

These are deliberately separate from the `001-booking-platform-rewrite` milestones
(#2–#9, one per rewrite phase). The two features are independent workstreams and should
not share a milestone. This feature should complete **before** the `001` Phase 6 UI work
begins, because the Angular migration is cheap while `apps/ui` is still the starter shell.

**Stage numbers are not execution order.** Milestone #11 (Stage 1) is done. The
recommended order from here is:

```text
Stage 4 (NestJS)  →  Stage 3 (Angular + TypeScript)  →  Stage 5
```

Stage 4 goes first because NestJS declares no `typescript` peer, so nothing in Stage 3
blocks it, and it touches only `apps/server`. Stage 2 has no pull request of its own: its
work is inside Stage 3 (FR-015). The ESLint-9 half of Stage 5 already landed in Stage 1.

A task is complete only when its acceptance criteria pass and the CI gate is green.

---

## Stage 0 — Pin and prune (S0)

- [ ] U001 Add `.nvmrc` (`24`), `engines.node`, and `packageManager` to `package.json`. (FR-002, FR-003)
  - Acceptance: `node -v` matches `.nvmrc`; installing on the wrong Node fails loudly.
- [ ] U002 [P] Move CI to Node 24: all four `node-version: 18` in `.github/workflows/ci.yml`. (FR-002)
  - Acceptance: all five CI jobs pass on Node 24 with the current dependency set.
- [ ] U003 [P] Move both Dockerfiles to a Node 24 base image; confirm `bcrypt` and the built server start. (FR-002, NFR-004)
  - Acceptance: `docker build` succeeds for `ui` and `server`; the server container starts with a valid `.env`.
- [ ] U004 [P] Remove the `nx-cloud` dependency. (FR-004, NFR-005)
  - Acceptance: `yarn why nx-cloud` reports nothing; CI still green.
- [ ] U005 [P] Remove `npmScope` from `nx.json`. (FR-005)
  - Acceptance: `nx` reports no schema warning.

## Stage 1 — Nx 16.1.2 → 23.3.1 (S1)

- [ ] U006 Pin `nx` and every `@nx/*` package to 23.3.1 by hand, and bump the lint stack to ESLint 9. (FR-012)
  - Acceptance: `yarn nx show project server` lists every target; CI green.
  - Note: `nx migrate 23.3.1` **cannot** be used — it fetches `@nx/linter@23.3.1`, which was removed after Nx 20, and aborts without producing `migrations.json`. `nx migrate latest` would also propose 24, which removes executors this repo uses.
  - Note: `@nx/eslint@23` refuses to run on ESLint 8 (`Supported: >= 9.0.0`), so the ESLint 9 bump cannot be deferred to Stage 5. Bump `eslint` to ^9.17, `@typescript-eslint/*` to ^8.18, `@angular-eslint/*` to ^18.4, `eslint-config-prettier` to ^9.1 and `eslint-plugin-cypress` to ^4.1 together with Nx.
- [ ] U007 Rename `@nx/linter:eslint` → `@nx/eslint:lint` in all four `project.json` files. (FR-007)
  - Acceptance: `yarn nx run-many --target=lint --all` reports 0 errors.
- [ ] U008 [P] Replace `@nrwl/*` and `@nx/linter` with their `@nx/*` equivalents, and add `@nx/angular@23.3.1`. (FR-012)
  - Acceptance: no `@nrwl/*` remains in `package.json` or `project.json`; `@nx/angular` is a direct dependency.
- [ ] U009 [P] Reconcile `nx.json` with the v23 schema and ignore the new `.nx/` cache. (FR-012)
  - Acceptance: build caching works (a repeat build is a cache hit); `.nx/cache` and `.nx/workspace-data` are gitignored.
  - Note: Nx 23 silently ignores `tasksRunnerOptions.cacheableOperations`, which stops caching with no warning. Move to per-target `cache: true` in `targetDefaults`.

## Stage 2 — TypeScript 5.0.2 → 6.0.3 (S2) — no pull request of its own

TypeScript cannot be raised while Angular is 16 (FR-015). These two tasks are executed
inside Stage 3, at the steps where the Angular peer range forces the move. They are kept
here only so the milestone and issue map stay aligned.

- [ ] U010 Raise TypeScript and set `target` to `es2022` in `tsconfig.base.json`. (FR-012, FR-015)
  - Acceptance: `yarn nx build server` and `build ui` succeed.
  - Note: the step is driven by Angular, not chosen: 5.2 at Angular 17, 5.5 at 18, 5.8 at 20, 6.0.3 at 22. Raising it against Angular 16 fails with "The Angular Compiler requires TypeScript >=4.9.3 and <5.1.0".
  - Note: TypeScript 6 also errors on `baseUrl` and `moduleResolution: node10` (TS5101, TS5107) and needs `ts-jest` ≥ 29.4.15 (29.1.0 peers `typescript <6`).
- [ ] U011 Fix type errors introduced by TypeScript 6 strictness. (FR-012)
  - Acceptance: all 21 existing tests pass unmodified.
  - Note: `catch (e)` is `unknown` under TypeScript 6. 11 of 15 suites fail on this before any other fix; `apps/server/src/app/users/service/user.service.ts` reads `e.status` and `e.message` unguarded.

## Stage 3 — Angular 16 → 22.2.3 (S3), with TypeScript riding along

TypeScript moves here, not before (FR-015). Recommended as two pull requests: 16→18 with
TypeScript 5.0.4→5.5, then 18→22 with TypeScript 5.5→6.0.3.

- [ ] U012 Step Angular through 17, 18, 19, 20 using `ng update`, verifying after each. (FR-012)
  - Acceptance: UI builds and serves after each major.
- [ ] U013 Migrate the UI build to `@angular/build:application` and rename `browserTarget` → `buildTarget`. (FR-006)
  - Acceptance: `yarn nx build ui --configuration=production` produces `dist/apps/ui/index.html`.
- [ ] U014 Migrate `jest-preset-angular` 13 → 17 and the test setup entry point. (FR-009)
  - Acceptance: UI test target runs; `setup-jest` is no longer imported.
- [ ] U015 Replace `HttpClientModule` with `provideHttpClient()` in `app.config.ts` and `app.component.ts`. (FR-006)
  - Acceptance: the shell still reaches `GET /api`.
- [ ] U016 Complete Angular 21 and 22 with `ng update`, plus `zone.js` 0.13 → 0.16. (FR-012)
  - Acceptance: `yarn nx serve ui` renders the shell; CI green.

## Stage 4 — NestJS 9.1 → 11.2.8 (S4)

- [ ] U017 Bump the `@nestjs/*` set to 11.2.8, `@nestjs/config` 11, `@nestjs/jwt` 11. (FR-012)
  - Acceptance: all 21 tests pass; the server starts.
- [ ] U018 Bump `mongoose` to 9.11.4 and `@nestjs/mongoose` to 11.0.4. (FR-012)
  - Acceptance: schemas register; a booking round-trips through the API.
- [ ] U019 Review Express 5 behaviour changes; confirm route and middleware parity across all 24 endpoints. (FR-011, US2)
  - Acceptance: each documented route returns the same status and payload shape as before.
- [ ] U020 Bump `bcrypt` 5.1 → 6.0 and `class-validator` 0.14 → 0.15. (FR-012)
  - Acceptance: sign-in succeeds; password validation rules unchanged.

## Stage 5 — ESLint 10, Jest 30, Cypress 16 (S5)

- [ ] U021 Migrate ESLint to flat config; replace the five `.eslintrc.json` files with `eslint.config.js`. (FR-008)
  - Acceptance: `yarn nx run-many --target=lint --all` reports 0 errors.
- [ ] U022 Bump `@typescript-eslint/*` to 8 and `@angular-eslint/*` to 22. (FR-008)
  - Acceptance: lint rules still catch a deliberate violation.
- [ ] U023 Verify `@nx/enforce-module-boundaries` still rejects a bad cross-project import. (FR-008)
  - Acceptance: a temporary `@server/*` import inside `apps/server` fails lint, then is reverted.
- [ ] U024 Bump Jest to 30 across `jest.config.ts` files and `jest.preset.js`. (FR-012)
  - Acceptance: 21 tests pass on Jest 30.
- [ ] U025 Bump Cypress to 16 and `@nx/cypress` to 23.3.1. (FR-012)
  - Acceptance: `nx e2e ui-e2e` starts (the starter spec may still fail; e2e is outside the CI gate).

## Code fixes carried by this feature

- [ ] U026 Write a failing test proving the Mongoose `pre('save')` hook re-hashes an already-hashed password, then fix it for Mongoose 9. (FR-010)
  - Acceptance: a test asserts the password is hashed exactly once per save; an update path preserves the existing hash.
- [ ] U027 Fix `@Delete('_id')` → `@Delete(':_id')` in `client.controller.ts` and `building.controller.ts`, with regression tests. (FR-011)
  - Acceptance: `DELETE /api/clients/{id}` and `DELETE /api/buildings/{id}` reach the handler.
  - Note: supersedes `001-booking-platform-rewrite` T024 (#28), now closed as a duplicate.

## Verification

- [ ] U028 [P] Confirm no dependency resolves outside its supported range (`yarn why` spot-check on the pinned majors). (SC-004)
- [ ] U029 [P] Confirm `node -v` agrees across CI, both Dockerfiles and `.nvmrc`. (SC-003)
- [ ] U030 [P] Confirm the env validation from PR #61 still fails fast on an invalid `.env`. (SC-006)
- [ ] U031 Update `AGENTS.md` with the new versions, Node floor and the flat-config lint command. (NFR-001)
- [ ] U032 Update `README.md` and `specs/001-booking-platform-rewrite/quickstart.md` for Node 24 and the new commands. (NFR-001)

---

## Dependency notes

- Stage 0 blocks every other stage. Diagnosing a native-module failure is much easier
  before six other changes land.
- Stage 1 blocks Stages 2–5: the executor renames change how every target runs.
- Stage 2 blocks Stage 3: Angular 22 requires TypeScript 6.
- Stage 3 and Stage 4 are independent of each other and may be interleaved, but each
  must land green on its own.
- Stage 5 depends on Stages 1 and 3 (the ESLint migration tooling comes from Nx 23,
  and `@angular-eslint` 22 requires Angular 22).
- U026 and U027 can proceed in parallel with any stage after Stage 1.

## Deferred to follow-ups (not in this feature)

- Nx 23.3.1 → 24 (inference plugins; removes the remaining executors).
- NestJS 11 → 12 (blocked by `@nx/nest` peers).
- TypeScript 6 → 7 (blocked by Angular and `ts-jest` peers).
- yarn 1 → 4 and lockfile v1 → v2.
- Zoneless change detection (Angular 20+), worth adopting with the feature UI.
