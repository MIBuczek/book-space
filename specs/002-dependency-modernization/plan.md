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

### Stage 1 — Nx 16 → 23.3.1

- `yarn nx migrate latest` then pin the resulting `nx` and `@nx/*` to 23.3.1.
- Run the generated `migrations.json`.
- Fix `@nx/linter:eslint` → `@nx/eslint:lint` in all four `project.json` files
  (FR-007).
- Remove `@nx/linter` and `@nrwl/*` in favour of `@nx/*` packages.
- Reconcile `nx.json` `targetDefaults` and `namedInputs` with the v23 schema.

Verification: lint, test, build green. This is the largest config change but carries
no application-code risk.

**Note**: `nx migrate` will propose jumping past 23.3.1. Pin deliberately and do not
accept 24 in this feature.

### Stage 2 — TypeScript 5.0.2 → 6.0.3

- Bump `typescript` to `~6.0.3`.
- Update `tsconfig.base.json`: `target` `es2015` → `es2022`, keep `lib`.
- Fix any new type errors. Expect `strict` violations and `unknown` narrowing.

Verification: all 21 tests pass; build green.

**Why before Angular**: Angular 22 requires TS 6, so this must land first, and doing
it alone keeps type errors separate from Angular's template errors.

### Stage 3 — Angular 16 → 22.2.3

One major at a time: 16→17→18→19→20→21→22. `nx migrate` handles the update
schematics per major; `ng update @angular/core@N @angular/cli@N` drives each step.
Stop and verify after each.

Code and config changes required:

- `apps/ui/project.json`: `@angular-devkit/build-angular:browser` →
  `@angular/build:application`; `dev-server` `browserTarget` → `buildTarget` (FR-006).
- `apps/ui/src/test-setup.ts`: `jest-preset-angular/setup-jest` → the v17+ entry
  point (`setup-env`). `setup-jest` no longer exists (FR-009).
- `apps/ui/src/app/app.component.ts`: `HttpClientModule` → `provideHttpClient()`.
- `apps/ui/src/app/app.config.ts`: add `provideHttpClient()` to providers.
- `jest-preset-angular` 13 → 17, `jest` 29 → 30.
- `zone.js` 0.13 → 0.16.

Verification: UI builds with `@angular/build:application`, `yarn nx serve ui` renders
the shell and still reaches `GET /api`.

**Why this is cheap now**: 9 UI files, 65 lines. After the feature UI exists, the same
migration touches every component.

### Stage 4 — NestJS 9 → 11.2.8

- Bump the `@nestjs/*` set to 11.2.8, `@nestjs/mongoose` to 11.0.4, `mongoose` to
  9.11.4, `@nestjs/config` to 11, `@nestjs/jwt` to 11.
- `@nestjs/platform-express` 11 pulls **Express 5**. Review middleware and route
  behaviour. No wildcard or regex routes exist, so the exposure is limited.
- `class-validator` 0.14 → 0.15.
- `bcrypt` 5.1 → 6.0.

Verification: all 21 tests pass; the 24 endpoints return unchanged payloads.

**Why after Angular**: the server and UI are independently deployable, and the server
is the smaller surface. Doing Angular first means the UI is on a supported framework
even if the server stage slips.

### Stage 5 — ESLint 8 → 10, Jest 30, Cypress 16

- ESLint flat config: replace the five `.eslintrc.json` files with
  `eslint.config.js` (FR-008). Use the `@nx/eslint` migration
  `update-23-1-0-convert-to-flat-config` as a starting point.
- `@typescript-eslint/*` 5 → 8, `@angular-eslint/*` → 22.
- Jest 30 across `jest.config.ts` and `jest.preset.js`.
- Cypress 12 → 16 and `@nx/cypress` to 23.3.1.

Verification: lint reports 0 errors; `@nx/enforce-module-boundaries` still passes
(this is what caught the 33 errors fixed in PR #59).

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
Fix here, and drop T024 from the other feature to avoid duplicate work.

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
