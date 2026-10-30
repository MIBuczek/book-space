# AGENTS.md

## Layout

Nx 23 workspace, Node 24 (`.nvmrc`/CI/`engines`). Apps: `apps/server` (NestJS 11 + Mongoose 9
on Express 5), `apps/ui` (Angular 16), plus `apps/server-e2e` and `apps/ui-e2e`. Shared types
live in `libs/models`.

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
- **ESLint still runs in eslintrc mode.** The five `.eslintrc.json` files are intentional;
  Nx detects the root `.eslintrc.json` and sets legacy mode itself, so no
  `ESLINT_USE_FLAT_CONFIG` is needed. Flat config lands in Stage 5.
- **`bcrypt` is a native addon.** It is the one dependency that can break on a Node upgrade
  independently of version ranges; confirm it loads and hashes after any runtime change.
  `bcrypt@6` builds and hashes fine on Node 24.
- **`@nestjs/config` has no 11.x line.** Its majors jump 4 → 12, so a NestJS 11 upgrade takes
  `@nestjs/config@4.0.4`, which peers `@nestjs/common ^10 || ^11`. Do not read the shared
  major number as a package version.
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
- **`ui:test` passes vacuously** (`passWithNoTests`, no specs exist yet). Do not read a
  green UI test run as evidence that the UI works.
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
