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
every PR, then a `gate` job that fails unless all of them passed. Branch protection should
require the single `CI` check.
