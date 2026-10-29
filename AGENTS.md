# AGENTS.md

## Layout

Nx workspace, Node 18 (`.nvmrc`/CI). Apps: `apps/server` (NestJS 9 + Mongoose),
`apps/ui` (Angular 16), plus `apps/server-e2e` and `apps/ui-e2e`. Shared types live in
`libs/models`.

## Commands

```bash
yarn install --frozen-lockfile
yarn nx run-many --target=lint --all
yarn nx run-many --target=test --projects=server,ui --configuration=ci
yarn nx run-many --target=build --projects=server,ui --configuration=production
```

## Constraints that are easy to get wrong

- **Always set `NX_NO_CLOUD=true`.** CI does. Do not reintroduce an Nx Cloud token into
  `nx.json`: a read-write token in this repository lets anyone poison the shared cache.
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
