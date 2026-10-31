# Book Space

Booking platform for the municipal sports facilities run by Siechnicka Inwestycyjna Spółka
Komunalna (SISK). The public browse a calendar of accepted bookings and submit requests;
SISK staff approve them, manage clients and facilities, and export reports.

This repository is the rewrite of `MIBuczek/sisk-booking-app` (React + Redux + Firebase), an
Nx monorepo with an Angular UI, a NestJS API and MongoDB. The legacy SPA ran every business
rule in the browser against a Firebase database that granted any authenticated user write
access to everything; the rewrite moves those rules behind a typed, tested API.

The target system is specified in [`specs/001-booking-platform-rewrite/`](specs/001-booking-platform-rewrite/spec.md).

## Requirements

- **Node.js 24** — pinned by `.nvmrc` and enforced by `engines` (`>=24.0.0 <25.0.0`).
  Run `nvm use` to pick up the right runtime.
- **Yarn 1.x** — the workspace uses Yarn 1 workspaces and a `yarn.lock`.
- **MongoDB** — a local `mongod` or an Atlas cluster. The database is named `book_space`.

## Setup

```bash
nvm use
yarn install --frozen-lockfile
```

Create `apps/server/.env` from the template and fill in real values. **Never commit this
file** — it is gitignored, and the previous credentials are still in git history.

```bash
cp apps/server/.env.example apps/server/.env
```

```dotenv
DB_URI=mongodb://localhost:27017/book_space
JWT_SECRET=<at least 32 random characters>
```

`JWT_SECRET` must be at least 32 characters. The server validates both variables at boot and
refuses to start with a message naming what is wrong, rather than failing later inside
`JwtModule`.

## Run

```bash
yarn start:all      # UI on http://localhost:4200 and API on http://localhost:3000/api
yarn start:ui       # UI only
yarn start:server   # API only
```

The API serves under the `/api` prefix. The UI reaches it at `http://localhost:3000/api`.

## Checks

```bash
yarn lint                                      # ESLint across all four projects
yarn nx run-many --target=test --projects=server,ui
yarn build:all
```

The same commands run in CI (`.github/workflows/ci.yml`), which gates lint, unit tests, the
production build and a secret scan of the built client bundle.

## Layout

| Path                                 | What it is                                           |
| ------------------------------------ | ---------------------------------------------------- |
| `apps/ui`                            | Angular 22 UI, standalone components                 |
| `apps/server`                        | NestJS 11 API                                        |
| `apps/ui-e2e`, `apps/server-e2e`     | Cypress end-to-end projects (outside the CI gate)    |
| `libs/models`                        | Types shared between UI and API                      |
| `specs/001-booking-platform-rewrite` | Specification, plan and task backlog for the rewrite |
| `specs/002-dependency-modernization` | Specification and plan for the toolchain upgrade     |

## Toolchain versions

Node 24 · Nx 23.3.1 · Angular 22 · TypeScript 6.0.3 · NestJS 11.2.8 · Mongoose 9 · Express 5 ·
Jest 30 · ESLint 10 (flat config) · Cypress 16.

Several of these are **deliberate ceilings**, not lagging updates — Nx 23, NestJS 11 and
TypeScript 6.0.x are pinned because the next major of each breaks this workspace. The reasons
are recorded in [`AGENTS.md`](AGENTS.md) under "Version ceilings". Read that before bumping
anything.

`AGENTS.md` also documents the repository's load-bearing constraints and the traps that cost
time during the upgrade. It is worth reading before making non-trivial changes.
