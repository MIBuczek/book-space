# Implementation Plan: Dependency and Runtime Modernization

**Feature Branch**: `002-dependency-modernization` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-dependency-modernization/spec.md`

## Summary

Move `book-space` from its 2023-era stack (Nx 16, Angular 16, NestJS 9, Node 18) to
the newest mutually-compatible set (Nx 23.3.1, Angular 22, NestJS 11, Node 24), in
six independently verifiable stages, without changing the HTTP contract.

The work is bounded because `apps/ui` is still the Nx starter shell and the server is
1851 lines. The upgrade is mostly configuration, plus two small code fixes.

## Constraint discovery

Version targets were derived from the npm registry, not from release notes. The
decisive findings, each of which changes the plan:

1. **`@nx/nest@24` peers `@nestjs/core >=10 <12`.** NestJS 12.3.2 is unreachable
   without dropping `@nx/nest`. Target NestJS 11.2.8.
2. **Angular 22 peers `typescript >=6.0 <6.1`.** TypeScript 7.0.2 is unreachable.
   Target 6.0.3.
3. **Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26.0.0`.** Node 18 (CI,
   Docker) cannot run it. Node 24 is the current LTS.
4. **Nx 24 ships empty `executors` for `@nx/jest`, `@nx/eslint` and `@nx/cypress`,
   and drops `webpack` from `@nx/webpack`.** This repo's `project.json` files use
   `@nx/jest:jest`, `@nx/linter:eslint` and `@nx/webpack:webpack`. Verified by
   extracting `executors.json` from each published tarball:

   ```
   nx 23.3.1   jest:[jest] eslint:[lint] webpack:[webpack|dev-server|ssr-dev-server]
   nx 24.0.2   jest:[]     eslint:[]     webpack:[ssr-dev-server]
   ```

   Targeting Nx 23.3.1 avoids a workspace-wide migration to inference plugins.
   `@nx/angular@23.3.1` peers `@angular/build >=20 <23`, so Angular 22 fits.
5. **TypeScript is pinned by Angular, not the other way round.** `@angular/compiler-cli`
   declares a narrow `typescript` peer per major, and the gates do not tile:

   | Angular | `typescript` peer |
   | ------- | ---------------- |
   | 16      | `>=4.9.3 <5.1`   |
   | 17      | `>=5.2 <5.5`     |
   | 18      | `>=5.4 <5.6`     |
   | 19      | `>=5.5 <5.9`     |
   | 20      | `>=5.8 <6.0`     |
   | 21      | `>=5.9 <6.1`     |
   | 22      | `>=6.0 <6.1`     |

   Every adjacent pair overlaps **except 16 → 17**: Angular 16 caps TypeScript below
   the floor Angular 17 requires. So TypeScript cannot be raised to 6.0.3 while Angular
   is 16, and the intended "TypeScript first, then Angular" order is impossible. Verified
   by installing TypeScript 6.0.3 against the current Angular 16.0.1 and building:

   ```
   Error: The Angular Compiler requires TypeScript >=4.9.3 and <5.1.0
          but 6.0.3 was found instead.
   ```

   The same run failed 11 of 15 test suites on real code errors (`catch (e)` is
   `unknown` from TypeScript 4.4's `useUnknownInCatchVariables`, which 6 makes loud).
   TypeScript therefore steps with Angular, not before it.
6. **`ts-jest` caps TypeScript at `<6`.** The installed 29.1.0 peers
   `typescript >=4.3 <6`; 29.4.15 lifts this to `<7`. The server test runner must move
   with TypeScript.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (server target ES2022, UI Angular 22)

**Runtime**: Node 24 LTS

**Primary Dependencies**: Nx 23.3.1, Angular 22.2.3 (`@angular/build:application`),
NestJS 11.2.8, Mongoose 9.11.4 via `@nestjs/mongoose` 11.0.4, Jest 30.5.2,
ESLint 10.13.0 (flat config), Cypress 16.2.0

**Storage**: MongoDB — unchanged. No schema change in this feature.

**Testing**: Jest for API and UI unit tests; the 21 existing tests are the
regression suite and MUST pass unmodified.

**Target Platform**: Linux containers, Node 24 base image.

**Constraints**: no HTTP contract change; no new token dependency; every stage lands
green behind the existing `CI` required check.

**Scale/Scope**: 2 applications, 1 library, 24 endpoints, 9 UI source files.

## Constitution Check

Adopted gates from `001-booking-platform-rewrite`, applied here:

1. **Server-side enforcement** — unaffected; no business logic changes.
2. **Single source of truth for types** — unaffected; `libs/models` is not restructured.
3. **No secrets in the client bundle** — preserved; the secret scan stays in the gate.
4. **Test-first for domain logic** — the two code fixes (FR-010, FR-011) require a
   failing test first.
5. **Migration is reversible** — each stage is a revertable commit; the legacy
   Firebase project is untouched.

## Staged sequence

Each stage is one pull request, branches off `main`, and must pass the `CI` gate
before the next begins. Stages are ordered so that a failure is attributable to one
version jump.

### Stage 0 — Pin and prune (no version change)

- Add `.nvmrc` with `24`.
- Add `engines.node: ">=24"` and `packageManager` to `package.json`.
- Update all four `node-version: 18` occurrences in `.github/workflows/ci.yml` to 24.
- Update `FROM node:18` in `apps/ui/Dockerfile` and `apps/server/Dockerfile` to
  `node:24-alpine` (or `node:24` if native builds fail).
- Remove `nx-cloud` from `devDependencies`.
- Remove `npmScope` from `nx.json`.

Verification: CI green on Node 24 with the old dependency set. This isolates "does
Node 24 work at all" from "do the new packages work". Expect `bcrypt` and `cypress`
to be the only candidates for trouble.

**Why first**: if Node 24 breaks a native module, it is far easier to diagnose here
than after six other changes.

### Stage 1 — Nx 16 → 23.3.1 (with ESLint 8 → 9)

`nx migrate 23.3.1` **cannot be used for this jump** and the lint-stack bump cannot be
deferred to Stage 5. Both were verified against the registry and by running the
upgrade on a scratch branch:

1. **`nx migrate` fails.** It resolves `@nx/linter` as part of the workspace's current
   package set and tries `yarn add -W @nx/linter@23.3.1`. That package was removed
   after Nx 20 (last stable `19.8.15`), so the fetch 404s and the command aborts with
   no `migrations.json`. Pin the versions in `package.json` by hand instead.
2. **`@nx/eslint@23` hard-requires ESLint >= 9.0.0.** Running the renamed executor
   against ESLint 8.15 or 8.57.1 aborts with `Unsupported version of 'eslint'
   detected. Installed: 8.57.1 / Supported: >= 9.0.0`. The error is a version gate,
   not a missing function: `@nx/eslint@23` calls `eslint.loadESLint`, which exists only
   from ESLint 9. Nx 17.0.6 is the last version whose `@nx/eslint` runs on ESLint 8.
   The ESLint 8 → 9 bump (FR-008's prerequisite) therefore belongs to Stage 1, and
   Stage 5 is left with flat config, Jest 30 and Cypress 16.
3. **Nx 23 plugins are not framework-locked.** `@nx/angular@23` and `@nx/nest@23`
   install and run against Angular 16.0.1 and NestJS 9.4.0 — their Angular/Nest peers
   are optional and only the generators consume them. Nothing in `project.json` uses an
   `@nx/angular` or `@nx/nest` executor, so the version skew is inert. Confirmed by a
   full green lint/test/build gate with both packages at 23.3.1.
4. **`@nx/angular@23` must be added.** It is not currently a direct dependency; the
   Angular support arrives through `@nrwl/angular@16`, which must be removed.

Changes:

- Remove `@nrwl/angular`, `@nrwl/nest` (from `dependencies`) and `@nx/linter`.
- Add `@nx/angular` and pin `nx` and every `@nx/*` package to 23.3.1.
- ESLint 8.15 → 9.17; `@typescript-eslint/*` 5.58 → 8.18;
  `@angular-eslint/*` 16 → 18; `eslint-config-prettier` 8.1 → 9.1;
  `eslint-plugin-cypress` 2.10 → 4.1 (its 2.x rules call `context.getAncestors`,
  removed in ESLint 9).
- Fix `@nx/linter:eslint` → `@nx/eslint:lint` in all four `project.json` files
  (FR-007).
- Reconcile `nx.json` with the v23 schema. `cacheableOperations` under
  `tasksRunnerOptions` is silently ignored by Nx 23 — caching stops working with no
  warning. Replace it with per-target `cache: true` in `targetDefaults`; verified by
  an identical rebuild hitting the cache.
- Add `.nx/cache` and `.nx/workspace-data` to `.gitignore`. Nx 17 moved its cache out
  of `node_modules/.cache` into `.nx/`, which is not currently ignored.

Legacy `.eslintrc.json` is kept. Nx detects a root `.eslintrc.json` and runs ESLint in
eslintrc mode, so no `ESLINT_USE_FLAT_CONFIG` is needed; flat config stays in Stage 5
(FR-008).

Verification: lint, test, build green; all 21 tests pass; caching works. The UI build
hash moves from `9b981ab76db6fe3a` to `063b0743c9c836e9` — this is **not** a
behaviour change. The two bundles are byte-identical except for six bytes of webpack
module-ID renumbering (`264` → `547`), caused by `@nx/webpack@23` no longer hoisting
webpack `^5.82` so `@angular-devkit/build-angular@16`'s exact pin of `5.80.0` wins.
The server and UI remain on Angular 16 and NestJS 9 throughout.

### Stage 2 — TypeScript (not independently landable)

**This stage cannot be executed on its own.** TypeScript cannot leave 5.0.x while
Angular is 16 (finding 5), so its work is carried out inside Stage 3. It is kept as a
numbered stage only so the milestone and the U010/U011 issues stay aligned; there is no
"bump TypeScript, then do Angular" pull request.

### Stage 3 — Angular 16 → 22.2.3, with TypeScript riding along

One major at a time: 16→17→18→19→20→21→22. `ng update @angular/core@N @angular/cli@N`
drives each step; stop and verify after each. TypeScript moves on the steps where the
peer range forces it — 16→17 (`>=5.2`), then to 5.5, 5.8, and finally 6.0.3 at 22.

Recommended as two pull requests so each diff stays reviewable:

- **3a** — Angular 16 → 18, TypeScript 5.0.4 → 5.5.
- **3b** — Angular 18 → 22, TypeScript 5.5 → 6.0.3.

Code and config changes required:

- `apps/ui/project.json`: `@angular-devkit/build-angular:browser` →
  `@angular/build:application`; `dev-server` `browserTarget` → `buildTarget` (FR-006).
- `apps/ui/src/test-setup.ts`: `jest-preset-angular/setup-jest` → the v17+ entry
  point (`setup-env`). `setup-jest` no longer exists (FR-009).
- `apps/ui/src/app/app.component.ts`: `HttpClientModule` → `provideHttpClient()`.
- `apps/ui/src/app/app.config.ts`: add `provideHttpClient()` to providers.
- `jest-preset-angular` 13 → 17, `jest` 29 → 30, `ts-jest` 29.1.0 → 29.4.15.
- `zone.js` 0.13 → 0.16.
- `tsconfig.base.json`: `target` `es2015` → `es2022`; `moduleResolution` `node` →
  `bundler` or `node16` and an explicit `ignoreDeprecations` for `baseUrl`. TypeScript 6
  errors on `baseUrl` and `moduleResolution: node10` (TS5101, TS5107).
- Every `catch (e)` that reads `e.message` / `e.status` needs narrowing. 11 of 15 test
  suites fail on this alone; `apps/server/src/app/users/service/user.service.ts` is the
  first offender.

Verification: all 21 tests pass; UI builds with `@angular/build:application`;
`yarn nx serve ui` renders the shell and still reaches `GET /api`.

**Why this is cheap now**: 9 UI files, 65 lines. After the feature UI exists, the same
migration touches every component.

### Stage 4 — NestJS 9 → 11.2.8, with Mongoose 9

Sequenced before the Angular ladder in practice (see "Stage order" below). NestJS
declares **no** `typescript` peer, so it is independent of the corridor in finding 5,
and it touches only `apps/server`.

- Bump the `@nestjs/*` set to 11.2.8, `@nestjs/mongoose` to 11.0.4, `mongoose` to
  9.11.4, `@nestjs/config` to 11, `@nestjs/jwt` to 11.
- `@nestjs/platform-express` 11 pulls **Express 5**. Review middleware and route
  behaviour. No wildcard or regex routes exist, so the exposure is limited.
- `class-validator` 0.14 → 0.15.
- `bcrypt` 5.1 → 6.0.

Verification: all 21 tests pass; the 24 endpoints return unchanged payloads.

**Why it can go first**: the server and UI are independently deployable, and the server
is the smaller surface. NestJS has no TypeScript peer, so nothing in Stage 3 blocks it.
Doing it first means the Angular migration is not holding a NestJS variable at the same
time.

### Stage 5 — ESLint flat config, Jest 30, Cypress 16

The ESLint 8 → 9 bump moved to Stage 1, because `@nx/eslint@23` refuses to run on
ESLint 8. This stage carries the config-format change and the remaining test-tool
bumps.

- ESLint flat config: replace the five `.eslintrc.json` files with
  `eslint.config.js` (FR-008). Use the `@nx/eslint` migration
  `update-23-1-0-convert-to-flat-config` as a starting point.
- `@angular-eslint/*` 18 → 22; `@typescript-eslint/*` stays on 8 (already at 8.18).
- Jest 30 across `jest.config.ts` and `jest.preset.js`.
- Cypress 12 → 16 and `@nx/cypress` to 23.3.1.

Verification: lint reports 0 errors; `@nx/enforce-module-boundaries` still passes
(this is what caught the 33 errors fixed in PR #59).

### Stage order

The stages are numbered for the milestone and issue map, but the recommended execution
order differs from the numbering:

```text
Stage 1 (done)  →  Stage 4 (NestJS)  →  Stage 3 (Angular + TypeScript)  →  Stage 5
```

Stage 2 has no pull request of its own; its work is inside Stage 3. The ESLint-9 half of
Stage 5 already landed in Stage 1, because `@nx/eslint@23` requires it; what remains
there is flat config and the test-tool bumps.

## Two code fixes this feature must carry

Both are latent defects that the upgrade makes visible. Both need a failing test
first (constitution gate 4).

**FR-011 — route parameters.** Two delete routes are declared with a literal `_id`
rather than a parameter:

```
apps/server/src/app/clients/controller/client.controller.ts:44   @Delete('_id')
apps/server/src/app/buildings/controller/building.controller.ts:47 @Delete('_id')
```

These can never match a request. `001-booking-platform-rewrite` already tracks this
as T024; the Express 5 upgrade makes it a correctness issue rather than a latent one.
Fix here. T024 (#28) was closed as a duplicate and its extra requirement — renaming the
buildings controller's copy-pasted `...Client` handlers — was folded into #88.

**FR-010 — Mongoose hook.** `user.schema.ts:57` uses `pre('save')` with a `next`
callback. Mongoose 9 prefers promise-returning hooks and warns on callback style.
Worse, the hook re-hashes on every save, so any update path that touches a user
document re-hashes an already-hashed password. This is a real bug today and must be
covered by a test asserting the hash is applied once per save.

## Project Structure

```text
specs/002-dependency-modernization/
├── spec.md       # this feature's specification
├── plan.md       # this file
└── tasks.md      # issue-sized breakdown

.nvmrc                              # NEW — Node 24
package.json                        # engines, packageManager, version bumps
nx.json                             # npmScope removed, schema reconciled
tsconfig.base.json                  # target es2022
eslint.config.js                    # NEW — flat config (Stage 5)
apps/ui/project.json                # @angular/build:application, buildTarget
apps/ui/src/app/app.config.ts       # provideHttpClient()
apps/ui/src/app/app.component.ts    # HttpClientModule removed
apps/ui/src/test-setup.ts           # jest-preset-angular v17 entry point
apps/{ui,server}/Dockerfile         # node:24
.github/workflows/ci.yml            # node-version: 24
apps/server/src/app/users/schemas/user.schema.ts        # FR-010
apps/server/src/app/clients/controller/client.controller.ts    # FR-011
apps/server/src/app/buildings/controller/building.controller.ts # FR-011
```

**Structure Decision**: no structural change. The Nx layout (`apps/server`, `apps/ui`,
`apps/server-e2e`, `apps/ui-e2e`, `libs/models`) is retained because `project.json`
targets, `tsconfig.base.json` aliases and the CI gate all depend on it. This feature
changes versions and configuration, not architecture.

## Verification per stage

The gate is the same at every stage, and it is the existing CI gate:

```bash
yarn install --frozen-lockfile
yarn nx run-many --target=lint --all
yarn nx run-many --target=test --projects=server,ui --configuration=ci
yarn nx run-many --target=build --projects=server,ui --configuration=production
node tools/scan-secrets.js
```

Plus, at stage boundaries:

- Stage 0: server starts on Node 24 (`node dist/apps/server/main.js` with a valid `.env`).
- Stage 1: `nx graph` renders; `nx show project server` lists all targets.
- Stage 3: `yarn nx serve ui` renders the shell.
- Stage 4: the 24 endpoints answer; `curl` the OpenAPI-documented routes.
- Stage 5: `@nx/enforce-module-boundaries` still catches a deliberate bad import.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Six stages rather than one dependency bump | Angular 16→22 is six majors with three config-format changes; a single PR would mix causes | One-shot upgrade makes a failure unattributable; with 65 lines of UI the per-stage overhead is small |
| Staying on Nx 23.3.1, not 24 | Nx 24 removes the jest/eslint/webpack executors this repo uses | Moving to Nx 24 now would add an inference-plugin migration on top of an already large upgrade; it is a clean follow-up once the rest is stable |
| Staying on NestJS 11.2.8, not 12 | `@nx/nest` peers `>=10 <12` | NestJS 12 would require dropping `@nx/nest`, removing scaffolding for no runtime benefit |
| TypeScript 6.0.3, not 7.0.2 | Angular 22 peers `>=6.0 <6.1`; `ts-jest` peers `<7` | TypeScript 7 is not reachable with Angular 22 |
| Carrying two code fixes (FR-010, FR-011) | The upgrade makes both visible; leaving them means a knowingly-broken stage | Deferring them to `001` means the delete routes stay broken through six stages and the Mongoose hook stays untested |

## Follow-ups created by this feature

- **Nx 24 migration** — adopt inference plugins, drop the remaining executors. Safe
  once the rest of the stack is current.
- **NestJS 12** — once `@nx/nest` supports it, or once `@nx/nest` is no longer wanted.
- **TypeScript 7** — once Angular and `ts-jest` accept it.
- **Zoneless change detection** — available from Angular 20; a worthwhile follow-up
  for the feature UI, not part of this upgrade.
- **yarn 1 → 4** — separate concern; lockfile v1 → v2 is its own migration.
