# AGENTS.md

## Layout

Nx 23 workspace, Node 24 (`.nvmrc`/CI/`engines`). Apps: `apps/server` (NestJS 11 + Mongoose 9
on Express 5), `apps/ui` (Angular 22, standalone), plus `apps/server-e2e` and `apps/ui-e2e`.
Shared types live in `libs/models`.

Writing conventions for the rewrite: `specs/001-booking-platform-rewrite/ui-conventions.md`
(Angular 22) and `specs/001-booking-platform-rewrite/backend-conventions.md` (NestJS 11). Read the
relevant one before writing code in that app; it records decisions that would otherwise be
re-derived per task.

The dependency-modernization plan (`specs/002-dependency-modernization/`) is complete. Every
stage has landed, so the table below is the current state, not a target:

| Package    | Version | Landed in |
| ---------- | ------- | --------- |
| Node       | 24      | Stage 0   |
| Nx         | 23.3.1  | Stage 1   |
| TypeScript | 6.0.3   | Stage 3   |
| Angular    | 22.2.4  | Stage 3   |
| NestJS     | 11.2.8  | Stage 4   |
| Mongoose   | 9.11.4  | Stage 4   |
| Express    | 5       | Stage 4   |
| Jest       | 30      | Stage 3   |
| ESLint     | 10      | Stage 5   |
| Cypress    | 16      | Stage 5   |

TypeScript is a single workspace-wide version pinned by Angular, so the server does not get
6.0.3 on its own — it moves when Angular moves. Check `package.json` rather than trusting a
version written down anywhere, including this file.

## Version ceilings

Three ceilings are deliberate. Each was verified against the npm registry, not read from
release notes. Do not raise them without re-checking the constraint named here; a version
that looks stale is usually pinned on purpose.

- **Nx 23, not 24.** Nx 24 ships empty `executors` maps for `@nx/jest`, `@nx/eslint` and
  `@nx/cypress`, and drops `webpack` from `@nx/webpack` (keeping only `ssr-dev-server`).
  Verified by extracting `executors.json` from the published tarballs:

  ```
  nx 23.3.1   jest:[jest] eslint:[lint] cypress:[cypress] webpack:[webpack|dev-server|ssr-dev-server]
  nx 24.0.3   jest:[]     eslint:[]     cypress:[]        webpack:[ssr-dev-server]
  ```

  Every `project.json` here uses `@nx/jest:jest`, `@nx/eslint:lint`, `@nx/cypress:cypress`
  and `@nx/webpack:webpack`, so moving to 24 means migrating the whole workspace to inference
  plugins first. That is a separate project, not a version bump.
- **NestJS 11, not 12.** `@nx/nest` peers `@nestjs/core >=10.0.0 <12.0.0` — still true in
  24.0.3. NestJS 12 is unreachable without dropping `@nx/nest`. Raising Nx does not lift this.
- **TypeScript 6.0.x, not 7.** `@angular/compiler-cli@22` peers `typescript >=6.0 <6.1`, so
  TypeScript 7 is unreachable while Angular is 22. Angular pins TypeScript, not the other way
  round, and the peer ranges do not tile: every adjacent Angular pair overlaps except
  16 → 17, where Angular 16 caps TypeScript below Angular 17's floor. TypeScript therefore
  steps *with* Angular, never before it. `ts-jest` adds a cap of its own: the previous
  29.1.0 peers `typescript >=4.3 <6`, so it had to move alongside TypeScript. The installed
  29.4.15 peers `typescript >=4.3 <7`, which is what lets the server test runner sit on 6.0.3.

`@nestjs/config` is a fourth case of the same trap: its majors jump 4 → 12 with no 11.x line,
so NestJS 11 takes `@nestjs/config@4.0.4`. See the constraint below.

## Commands

```bash
yarn install --frozen-lockfile
yarn nx run-many --target=lint --all
yarn nx run-many --target=test --projects=server,ui --configuration=ci
yarn nx run-many --target=build --projects=server,ui --configuration=production
```

Add `--skip-nx-cache` when you need to be sure a result is real rather than replayed.

## Environment setup

The repo is a **Yarn 1** workspace (`yarn.lock` is lockfile v1). Some sandboxes ship Node
without `yarn`, and `corepack enable` fails there because it cannot write symlinks into
`/usr/local/bin`. Install yarn 1 into a user-local prefix instead:

```bash
npm i -g yarn@1.22.22 --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
```

`npm i -g` without `--prefix` fails the same way for the same reason. Do not "fix" this by
switching the project to npm or pnpm: `yarn.lock` v1 is not readable by them, and CI uses
`yarn install --frozen-lockfile`.

## Constraints that are easy to get wrong

- **Always set `NX_NO_CLOUD=true`.** CI does. The `nx-cloud` client was removed in Stage 0;
  do not reintroduce it or an Nx Cloud token into `nx.json`: a read-write token in this
  repository lets anyone poison the shared cache.
- **`npmScope` is gone from `nx.json` and must not come back.** Nx 17 dropped it from the
  schema. The `@models/*` and `@server/*` aliases resolve through `paths` in
  `tsconfig.base.json`, so nothing depends on `npmScope`.
- **Never run `nx migrate` in this repository.** It resolves `@nx/linter` from the current
  package set and tries to install `@nx/linter@23.3.1`, which was removed after Nx 20; the
  fetch 404s and the command aborts with no `migrations.json`. Bump `nx` and every `@nx/*`
  in `package.json` by hand instead.
- **`@nx/eslint` and ESLint are version-locked.** `@nx/eslint@23` refuses to run on ESLint 8
  (`Supported: >= 9.0.0`) because it calls `eslint.loadESLint`. Nx 17.0.6 is the last version
  whose `@nx/eslint` runs on ESLint 8. Any further `nx` bump must move `eslint`,
  `@typescript-eslint` and `@angular-eslint` with it.
- **Caching is configured per target, not via `tasksRunnerOptions`.** Nx 23 ignores
  `tasksRunnerOptions.cacheableOperations` silently — targets just stop being cached, with no
  warning. `cache: true` lives in `targetDefaults` in `nx.json`. If a repeat build is not a
  cache hit, this is the first thing to check.
- **`.nx/cache` and `.nx/workspace-data` are gitignored.** Nx 17 moved its cache out of
  `node_modules/.cache`; `.nx/` grows to tens of megabytes and must never be committed.
- **ESLint runs on flat config.** `eslint.config.mjs` exists at the root and in all four
  projects; the five `.eslintrc.json` files and `.eslintignore` are gone (Stage 5, U021).
  `.eslintignore` only listed `node_modules`, which flat config ignores by default. The
  per-project configs import the root one and spread `nx.configs['flat/*']`.
- **`yarn lint` runs the Nx target, and the root config ignores build output.** The legacy
  root `.eslintrc.json` carried `ignorePatterns: ["**/*"]`, which made the root config match
  nothing so each project was linted through its own config. `convert-to-flat-config` does not
  carry that over, so bare `eslint` walks `dist/` and `.angular/cache/` and exits with
  thousands of errors. The ignores are now explicit in `eslint.config.mjs` and the `lint`
  script is `nx run-many --target=lint --all`, which resolves per-project configs.
- **`@angular-eslint` 22 dropped its legacy `plugin:` configs.** There is no
  `plugin:@angular-eslint/template/process-inline-templates` or `plugin:@nx/angular` to
  `extends` any more, and `@angular-eslint/*` no longer ships `dist/configs`. The
  `convert-to-flat-config` generator still emits a `FlatCompat` block referencing them, which
  fails at load with `Failed to load config "plugin:@angular-eslint/template/..."`. Use
  `nx.configs['flat/angular']` and `nx.configs['flat/angular-template']` instead — Nx bundles
  the inline-template processor and the same rule sets, so no `FlatCompat` is needed.
- **Lint output is 0 errors, 5 warnings.** The 5 are pre-existing `no-unused-vars` /
  `no-explicit-any` findings in `apps/server`; they are the Stage 5 acceptance baseline. A
  change in that count means a rule was silently dropped or added.
- **A passing lint cannot prove a rule is live.** `@nx/enforce-module-boundaries` is what
  caught the 33 errors fixed in PR #59, and it is the rule most likely to vanish silently in a
  config-format change. Verify it by adding an `@server/*` import inside `apps/server` where a
  relative import is correct and confirming lint *fails*; a green run looks identical whether
  the rule works or is absent (U023).
- **`@typescript-eslint/types`, `@typescript-eslint/utils` and `jsdom` are direct devDependencies
  on purpose.** `@angular-eslint@22` peers `@typescript-eslint/utils@^8` and
  `jest-preset-angular@17` peers `jsdom@>=26`, but nothing else pulls either one in, so yarn 1
  reports them as unmet peers even though the packages are hoisted and working. Declaring them
  is what clears the install warnings (U028). Do not remove them as "unused" — `yarn why` shows
  no other requester, which is exactly the point.
- **Two `incorrect peer dependency` warnings remain and are not fixable here.** `@napi-rs/wasm-runtime`
  (inside `@angular/build`'s optional `wasm32-wasi` binding) wants `@emnapi/core@^1.7.1`, while
  `nx@23.3.1` pins `@emnapi/core` to exactly `1.4.5`. That is an upstream disagreement between
  Nx and Angular; forcing it with a `resolutions` entry would override Nx's exact pin. They are
  warnings about an optional wasm path, not a resolution error.
- **`bcrypt` is a native addon.** It is the one dependency that can break on a Node upgrade
  independently of version ranges; confirm it loads and hashes after any runtime change.
  `bcrypt@6` builds and hashes fine on Node 24.
- **`@nestjs/config` has no 11.x line.** Its majors jump 4 → 12, so a NestJS 11 upgrade takes
  `@nestjs/config@4.0.4`, which peers `@nestjs/common ^10 || ^11`. Do not read the shared
  major number as a package version.
- **TypeScript 6 defaults `strict` to `true`.** This is the single biggest trap in the
  Angular 22 step, and it is not Angular's doing: the same source that compiles under
  TypeScript 5.5.4 fails under 6.0.3 with no tsconfig change. Verified by A/B against both
  compilers — under 5.5.4 `{}` compiles, under 6.0.3 `{}` reports TS18046/TS18047/TS7006.
  The repository predated strict mode, so `tsconfig.base.json` set `strict: false` to keep
  the previous semantics. **That pin has been removed (#105); the compiler default now
  applies.** The migration was 91 errors in the server and none in the UI: 85 `TS2564`
  class properties (Mongoose schemas, DTOs, `env.validation.ts` — all populated by
  decorators or the framework, so `!` is the deliberate annotation), 43 `TS18046` catch
  clauses across 23 blocks, 2 `TS7016` for `bcrypt` (fixed by installing `@types/bcrypt`),
  plus `TS7053`, `TS2366`, `TS2345` and `TS18047`. Measured by flag, `strict` is eight
  flags and they do not sum: four report 0 errors on their own, `strictPropertyInitialization`
  reports 1 alone but 85 once `strictNullChecks` is on. Do not plan this per-flag.
- **`target` is `es2022`, in both `tsconfig.base.json` and `apps/server/tsconfig.app.json`.**
  Both had to move: the server's `tsconfig.app.json` sets its own `target` and does not inherit
  the base one, so changing only the base leaves the server emitting ES2015 (U010).
- **`moduleResolution: "node"` (node10) cannot read Angular 22.** Angular 22 packages are
  `exports`-only — `@angular/common` ships no physical `http/` directory, only
  `exports["./http"]`. node10 ignores `exports` maps, so `import { HttpClient } from
  '@angular/common/http'` fails with TS2307 even though the types exist. `tsconfig.base.json`
  uses `moduleResolution: "bundler"`, which also lets `baseUrl` be dropped: `paths` entries
  are already `./`-prefixed, so they resolve relative to the tsconfig. Both `baseUrl` and
  node10 are hard errors under TypeScript 6 (TS5101/TS5107), not warnings.
- **Removing `@angular-devkit/build-angular` removes `webpack`.** The server builds with
  `@nx/webpack:webpack`, which needs `webpack` at the workspace root. `webpack` used to arrive
  transitively via `@angular-devkit/build-angular`; once Angular 22 uses `@angular/build`,
  nothing provides it and the server build dies with `Cannot find module 'webpack'` — a
  failure that looks like an Nx problem and is not. `webpack@^5.112.2` is now a direct
  devDependency.
- **`@angular-eslint` 22 requires flat config, and that is now the state.** v22 drops the
  legacy `dist/configs` entry points, so an `.eslintrc.json` workspace cannot use it
  (`Failed to load config "plugin:@angular-eslint/recommended"`). The 21 → 22 move was held
  until Stage 5 moved ESLint to flat config; both have now landed, so `@angular-eslint/*` and
  `angular-eslint` are on 22.6.0 and there is no version ceiling left here. If this ever has to
  be reverted, it reverts *with* the flat config, not on its own.
- **`@angular-eslint` 22 adds `prefer-on-push-component-change-detection` as an error.** In
  Angular 22 `OnPush` is the default, so the rule fires only on an explicit
  `changeDetection: ChangeDetectionStrategy.Default`, not on a component that omits the
  property. A component with no `changeDetection` is already compliant.
- **`@angular-eslint@21` adds `prefer-inject`.** It flags constructor parameter injection in
  favour of `inject()`. `AppComponent` was migrated rather than disabling the rule.
- **Mongoose 9 removed callback-style middleware.** `pre('save', function (next) {...})` no
  longer compiles — `next` is typed `SaveOptions` and calling it is TS2349. Write hooks as
  plain async functions instead. `@nestjs/mongoose@11` pulls this in with Mongoose 9.
- **`nx test` does not type-check files no spec imports.** The `user.schema.ts` TS2349 above
  passed `nx test` and only failed `nx build`. When a dependency bump changes library types,
  run the build too — a green test run is not a type check.
- **Inside `apps/server`, use relative imports.** `@server/*` resolves to a file in the
  same project, which trips `@nx/enforce-module-boundaries`. Cross-project imports use
  the `@models/*` alias, which is fine.
- **Never commit `apps/server/.env`.** It is gitignored; `apps/server/.env.example` is the
  template. The real MongoDB URI and `JWT_SECRET` were committed historically and remain in
  git history.
- **`ui:test` has a single spec.** `apps/ui/src/app/app.component.spec.ts` is the only one, and
  it exists to guard the test harness and the HttpClient wiring. A green UI run is still thin
  evidence that the UI works — do not read it as coverage of the app.
- **Integration tests use `createMongoTestContext()`** (`apps/server/src/testing/`). CI has no
  MongoDB, so it starts an ephemeral `mongod` via `mongodb-memory-server`. Three traps, all
  already handled there:
  - **MongoDB driver 7.x + Jest = a 27-second hang, not an error.** The driver resolves its
    `os` adapter with a dynamic `import('os')`, which Jest's `vm` sandbox rejects
    ("A dynamic import callback was invoked without --experimental-vm-modules"). The driver
    swallows the rejection, so client metadata ships without its `driver` sub-document and
    `mongod` refuses the handshake. `MongooseModule` then retries 9x every 3s, which looks
    like a hang. Fix: pass `runtimeAdapters: {os}` to `createConnection` (test-only; the
    production app resolves `os` normally).
  - **The connection must be overridden, not just the URI.** `runtimeAdapters` cannot be
    expressed through `MongooseModule.forRoot(uri)`, so the harness overrides the
    `getConnectionToken()` provider with a connection it builds itself.
  - **`AppModule` reads `DB_URI` at import time.** Import it *after* `mongod` is up, never at
    module top level, or the URI is captured as `undefined`.
  `reset()` drops the database between tests, and `mongo-test-context.spec.ts` proves the
  harness boots the real app and that isolation works.
- **The `mongod` version is pinned** in `apps/server/src/testing/mongo-version.ts`. Left
  unpinned, `mongodb-memory-server` resolves the latest supported version at install time, so
  the same commit could be tested against different servers. CI caches the ~220 MB binary,
  keyed on the version.
- **`actions/cache` does not expand `~`.** The first version of that cache step used
  `path: ~/.cache/mongodb-binaries`; it looked for a directory literally named `~`, so it
  never restored and never saved, and the only signal was a warning. The workflow now sets
  `MONGOMS_DOWNLOAD_DIR` to an absolute `${{ github.workspace }}/.cache/mongodb-binaries` and
  caches that. The restore must also come *before* `yarn install`, because the package's
  postinstall hook downloads the binary when it is missing.
- **Jest's `coveragePathIgnorePatterns` are matched against absolute paths.** `^src/main\.ts$`
  matched nothing and `main.ts` sat in the denominator at 0%; use `/src/main\.ts$`. Prefer
  unanchored suffixes (`.module.ts$`) or anchor on `/src/`.
- **Test scaffolding is excluded from coverage** (`/src/testing/`). It is ~98% covered by its
  own spec, so counting it inflated the global figure from 54.18% to 67.44% without a line of
  production code changing.
- E2E projects are not part of the CI gate: `ui-e2e` still asserts the Nx starter text.

## CI

`.github/workflows/ci.yml` runs lint, unit tests, build and a client-bundle secret scan on
every PR, then a `gate` job that fails unless all of them passed.

## Branch ruleset

`main` is protected by the `OpenHandsBookSpace` ruleset (id 26131068): deletion and
non-fast-forward blocked, PR required, and the single `CI` check required. Require `CI`
alone — the `gate` job already aggregates lint, test, build and secrets with `if: always()`,
so listing the four sub-checks individually is redundant and, if a job is ever renamed,
leaves a check that can never be satisfied.

Three things that are easy to get wrong:

- **`git push --dry-run` does not validate rulesets.** It reports success while the real
  push is rejected. Do not use it as a gate in scripts.
- **The ruleset has `bypass_mode: always` for Repository admin**, so CI does not actually
  block a direct push to `main` by an admin. It protects against accidents, not against you.
- **Testing a bypass-enabled rule with a bypass-enabled token is self-defeating.** The push
  succeeds, so the test proves nothing about the rule. Read the ruleset config via
  `GET /repos/{owner}/{repo}/rulesets/{id}` instead of pushing to `main`.

## Constitution

`.specify/memory/constitution.md` (v1.0.0) is binding. It supersedes other practices, so
read it before starting work that touches authorisation, domain logic or shared types.

The principles that change day-to-day decisions most often:

- **Server-side enforcement** — a rule enforced only in the UI does not exist.
- **Test-first for domain logic** — a task implementing domain logic is not complete
  until its tests pass; a behaviour change changes a test. A `toBeDefined()` assertion is
  not a test.
- **Measured coverage** — 80 % on the domain modules, 100 % on files added or modified,
  and the global threshold is a ratchet that is never lowered.
- **Single source of truth for types** — payload types live in `libs/models`, not in each
  app.

The spec-driven artefacts are `specs/001-booking-platform-rewrite/` (spec, plan, tasks,
contracts, `ui-conventions.md`, and `backend-conventions.md` once #107 lands) and
`specs/002-dependency-modernization/` (complete). Work not traceable to a task in a
`tasks.md` is out of scope until it is written down.
