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

**Known duplicate**: U027 (#88) and `001-booking-platform-rewrite` T024 (#28) describe the
same route fix. Exactly one should remain open; both are currently open so the maintainer
chooses rather than the choice being made silently.

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

- [ ] U006 Run `nx migrate` to 23.3.1 and apply `migrations.json`; pin `nx` and `@nx/*` to 23.3.1. (FR-012)
  - Acceptance: `yarn nx show project server` lists every target; CI green.
  - Note: `nx migrate latest` will propose 24. Pin to 23.3.1 deliberately — 24 removes executors this repo uses.
- [ ] U007 Rename `@nx/linter:eslint` → `@nx/eslint:lint` in all four `project.json` files. (FR-007)
  - Acceptance: `yarn nx run-many --target=lint --all` reports 0 errors.
- [ ] U008 [P] Replace `@nrwl/*` and `@nx/linter` with their `@nx/*` equivalents. (FR-012)
  - Acceptance: no `@nrwl/*` remains in `package.json` or `project.json`.
- [ ] U009 [P] Reconcile `nx.json` `targetDefaults` and `namedInputs` with the v23 schema. (FR-012)
  - Acceptance: `nx` emits no configuration warnings; build caching still works.

## Stage 2 — TypeScript 5.0.2 → 6.0.3 (S2)

- [ ] U010 Bump `typescript` to `~6.0.3` and set `target` to `es2022` in `tsconfig.base.json`. (FR-012)
  - Acceptance: `yarn nx build server` and `build ui` succeed.
- [ ] U011 Fix type errors introduced by TypeScript 6 strictness. (FR-012)
  - Acceptance: all 21 existing tests pass unmodified.

## Stage 3 — Angular 16 → 22.2.3 (S3)

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
  - Note: `001-booking-platform-rewrite` tracks this as T024. Remove T024 there to avoid duplicate work.

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
