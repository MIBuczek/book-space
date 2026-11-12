# Book Space

Booking platform for the municipal sports facilities run by Siechnicka Inwestycyjna Spółka
Komunalna (SISK). The public browse a calendar of accepted bookings and submit requests;
SISK staff approve them, manage clients and facilities, and export reports.

This repository is the rewrite of `MIBuczek/sisk-booking-app` (React + Redux + Firebase), an
Nx monorepo with an Angular UI, a NestJS API and MongoDB. The legacy SPA ran every business
rule in the browser against a Firebase database that granted any authenticated user write
access to everything; the rewrite moves those rules behind a typed, tested API.

## Architecture

| Layer    | Stack                                                               |
| -------- | ------------------------------------------------------------------- |
| UI       | Angular 22, standalone components, zoneless change detection        |
| API      | NestJS 11 on Express 5, Mongoose 9, JWT authentication              |
| Database | MongoDB (Atlas or self-hosted), database name `book_space`          |
| Build    | Nx 23 monorepo, TypeScript 6, Jest 30, Cypress 16, ESLint 10 (flat) |

The API owns every business rule: authorisation, booking conflicts, facility sizes, report
totals. The UI renders what the API answers. Shared payload types live in `libs/models` so
the two applications cannot disagree about a request or response shape.

```
Browser ──▶ UI (Angular)  ──/api──▶ API (NestJS) ──▶ MongoDB
```

In development the Angular dev server proxies `/api` to `http://localhost:3000`. In
production nginx serves the built assets and proxies `/api` to the API container (see
[Deployment](#deployment)).

## Prerequisites

- **Node.js 24** — pinned by `.nvmrc` and enforced by `engines` (`>=24.0.0 <25.0.0`).
  Run `nvm use` to pick up the right runtime.
- **Yarn 1.x** — the workspace uses Yarn 1 workspaces and a `yarn.lock`. The project pins
  `yarn@1.22.22` in `package.json` (`packageManager`).
- **MongoDB** — a local `mongod`, a container, or an Atlas cluster. The database is named
  `book_space`.
- **Docker and Docker Compose** — optional, for the containerised workflow.

If `yarn` is not installed, `corepack enable` may fail in a sandbox that cannot write
symlinks into `/usr/local/bin`. Install it into a user-local prefix instead:

```bash
npm i -g yarn@1.22.22 --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
```

## Configuration

The API reads its configuration from the environment. Locally, copy the template and fill in
real values — **never commit `apps/server/.env`** (it is gitignored, and the legacy
credentials are still in git history):

```bash
cp apps/server/.env.example apps/server/.env
```

| Key                   | Required | Purpose                                                                                                                                                                  |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_URI`              | yes      | MongoDB connection string. Must start with `mongodb://` or `mongodb+srv://`. Use `mongodb://localhost:27017/book_space` for a local database.                            |
| `JWT_SECRET`          | yes      | Signing key for the session token. **At least 32 characters.** Generate one with `openssl rand -base64 48`.                                                              |
| `PORT`                | no       | Port the API listens on. Defaults to `3000`. The API always serves under the `/api` prefix.                                                                              |
| `SEED_REFERENCE_DATA` | no       | Set to the exact string `true` to upsert the twelve reference facilities on start-up. Off by default: the seed is authoritative and overwrites an administrator's edits. |
| `MAIL_ENDPOINT`       | no       | HTTP endpoint the outbound-mail provider is POSTed to. Unset disables sending: a notification then fails visibly (`502`) rather than silently.                           |
| `MAIL_API_KEY`        | no       | Bearer token sent to `MAIL_ENDPOINT`.                                                                                                                                    |
| `MAIL_FROM`           | no       | Sender address on outbound mail.                                                                                                                                         |
| `SISK_CONTACT_EMAIL`  | no       | The SISK inbox that staff notifications and contact-form messages are delivered to (FR-033, FR-034).                                                                     |
| `PUBLIC_RATE_LIMIT`   | no       | Requests allowed per window from one client address and per submitted e-mail on the public write routes (FR-048). Defaults to `12`; `0` disables the check.             |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | no | The rate-limit window in milliseconds. Defaults to `600000` (10 minutes).                                                                                                |
| `NOTIFICATION_QUOTA`  | no       | Outbound messages allowed per recipient address per window (FR-050). Defaults to `20`; `0` disables the check.                                                          |
| `NOTIFICATION_QUOTA_WINDOW_MS` | no | The outbound-quota window in milliseconds. Defaults to `3600000` (1 hour).                                                                                              |

The server validates the environment at boot and refuses to start with a message naming what
is wrong, rather than failing later inside `JwtModule` or `MongooseModule`. `DB_URI` and
`JWT_SECRET` are the only variables that stop the server from booting; the rest degrade a
specific feature rather than the whole application.

`SEED_REFERENCE_DATA` must be exactly `true`. Any other value (including `false`) leaves the
seed off — a boolean field would be coerced with `Boolean(value)` where `Boolean('false')` is
`true`, so the flag is compared as a string.

## Run locally

```bash
nvm use
yarn install --frozen-lockfile

yarn start:all      # UI on http://localhost:4200 and API on http://localhost:3000/api
yarn start:ui       # UI only
yarn start:server   # API only
```

The API serves under the `/api` prefix. The UI dev server proxies `/api` to
`http://localhost:3000` (see `apps/ui/proxy.conf.json`), so the browser talks to a single
origin.

### Seed the reference data

Facilities and cities are data, not constants (research.md R6). The twelve facilities from
`spec.md` section 4 are seeded by `ReferenceDataService`, which upserts each on its
`{city, property}` key. The seed is authoritative, so it only runs when asked:

```bash
SEED_REFERENCE_DATA=true yarn start:server
```

Running it twice is safe: it matches on the key, so a second run leaves twelve documents
rather than adding twelve more, and it completes a partially seeded database rather than
skipping it.

### Create the first administrator

A fresh database has no account, and there is no public registration, so nothing can sign in
until one administrator exists. Create it with the `bootstrap-admin` tool, which writes the
account directly to MongoDB and hashes the password through the users schema's `pre('save')`
hook — the same path the API uses, so the stored value is a `bcrypt` hash:

```bash
BOOTSTRAP_ADMIN_PASSWORD='<at least 6 characters>' \
  yarn nx run bootstrap-admin:run -- \
    --target "$DB_URI" \
    --email admin@sisk.pl \
    --first-name Ada --last-name Sisk
```

`--target` is the MongoDB URI (the same value as `DB_URI`), `--email` is required, and the
password comes from `BOOTSTRAP_ADMIN_PASSWORD` so it stays out of the shell history and the
process listing; `--password` is accepted for a one-off local run but is not the documented
path. `--first-name` and `--last-name` default to `Administrator` / `SISK`. The tool exits `0`
when an administrator now exists — including when one already did, which it reports as a
refusal so a re-run in a deployment script does not fail the pipeline — and `1` on any other
outcome. Sign in at `/sign-in` with the address and password you supplied.

After that, create further staff accounts from the administrator's Users tab (FR-045); the
bootstrap is only for the first one, because an empty database has no administrator to create
one (FR-046, §8).

## Run with Docker

`docker compose up --build` builds both images and starts MongoDB, the API and the UI:

```bash
docker compose up --build      # UI on http://localhost:4200, API on http://localhost:3000
```

| Service  | Image          | Port          | Notes                                                                |
| -------- | -------------- | ------------- | -------------------------------------------------------------------- |
| `ui`     | `nginx:alpine` | `4200` → `80` | Serves the built Angular assets and proxies `/api` to `server:3000`. |
| `server` | `node:24-slim` | `3000`        | Runs the compiled API bundle with production dependencies only.      |
| `mongo`  | `mongo:7`      | internal only | Data is kept in the `mongo-data` volume; the port is not published.  |

Override the defaults through the environment, for example:

```bash
JWT_SECRET="$(openssl rand -base64 48)" SEED_REFERENCE_DATA=true docker compose up --build
```

Both Dockerfiles are multi-stage: a `node:24` builder installs the workspace and runs the
production Nx build, and the runtime stage copies only the build output (the API also copies
its production `node_modules`). The API image runs as the non-root `node` user.

A note for CI and sandboxes: the Nx build stamps `git rev-list --count HEAD` into the version
file, so the Docker build context must carry full git history. A shallow clone fails the build
loudly rather than stamping a wrong build number.

## Checks

```bash
yarn lint                                      # ESLint across every project (flat config)
yarn nx run-many --target=test --projects=server,ui,date-time,booking-rules,reporting,version,migration,bootstrap-admin,backup,copy --configuration=ci
yarn build:all                                 # production build of every affected project
yarn nx e2e server-e2e                         # API end-to-end tests
yarn nx e2e ui-e2e                             # UI end-to-end tests (Cypress)
```

Run the unit tests for a shared library on its own when you change it — `--projects=server,ui`
does not include `date-time`, `booking-rules`, `reporting`, `version` or the `tools/*` projects, so a change there
would otherwise pass unnoticed:

```bash
yarn nx test date-time
```

The same commands run in CI (`.github/workflows/ci.yml`), which gates lint, unit tests with
coverage, the production build, the end-to-end journeys and a secret scan of the built client
bundle. The single required status check is `CI`, which aggregates the rest.

## Deployment

Two images, one database, and a reverse proxy:

- **UI** — `apps/ui/Dockerfile` builds the Angular bundle and serves it from nginx. The nginx
  template (`apps/ui/nginx.conf.template`) falls every unmatched path through to `index.html`
  (the SPA routes on the client) and proxies `/api/` to the API. The upstream comes from the
  `API_UPSTREAM` environment variable, substituted at container start, so the image is not
  tied to a compose service name.
- **API** — `apps/server/Dockerfile` runs the compiled NestJS bundle. It is stateless: all
  state is in MongoDB and the session token is a JWT, so the container can be restarted or
  scaled without a shared session store.
- **Reverse proxy** — nginx in the UI image is the proxy for `/api`. In a deployment with an
  external proxy (ingress, load balancer), point it at the same two containers: static assets
  from `ui`, `/api` to `server`.

The database is named `book_space` and holds the `users`, `clients`, `buildings` and
`bookings` collections. `bookedTimes` is embedded in each booking document. Indexes are
declared on the schemas and built on first use; `nx test server` asserts the query planner
picks them.

Environment variables for a deployment are the same keys as [Configuration](#configuration).
At minimum set `DB_URI` and `JWT_SECRET`; set `MAIL_*` and `SISK_CONTACT_EMAIL` to enable
notifications.

## Branch and release convention

- **Branches.** Work happens on a topic branch off `main`, named `feat/tNNN-short-slug` (the
  task id from `specs/001-booking-platform-rewrite/tasks.md`) or `docs/short-slug` for
  documentation-only changes.
- **Merging.** `main` is protected: a pull request is required and the `CI` check must pass.
  Merges are squashed, so one task is one commit on `main` and `git log --oneline` reads as a
  task list.
- **Version.** The application version is `1.0.0` plus the commit count as semver build
  metadata, e.g. `1.0.0+63`. `tools/generate-version.js` stamps the count at build time;
  `libs/version` exposes it. There are no release tags — the build number _is_ the version, so
  a deployed bundle identifies the commit it came from.

## Layout

| Path                                 | What it is                                                    |
| ------------------------------------ | ------------------------------------------------------------- |
| `apps/ui`                            | Angular 22 UI, standalone components                          |
| `apps/server`                        | NestJS 11 API                                                 |
| `apps/ui-e2e`, `apps/server-e2e`     | Cypress end-to-end projects                                   |
| `libs/models`                        | Types shared between UI and API                               |
| `libs/date-time`                     | Facility-time conversion (`@booking/date-time`)               |
| `libs/booking-rules`                 | Slot overlap and cyclical expansion (`@booking/rules`)        |
| `libs/reporting`                     | Report and CSV vocabulary (`@booking/reporting`)              |
| `libs/copy`                          | The user-facing Polish copy catalogue (`@booking/copy`)       |
| `libs/version`                       | The build number and application version (`@booking/version`) |
| `tools/migration`                    | The one-off Firebase → MongoDB migration tool                 |
| `tools/bootstrap-admin`              | Creates the first administrator in a fresh database (FR-046)  |
| `tools/backup`                       | Backup, restore and archived-booking retention (T060)         |
| `docs/operations.md`                 | Backup cadence, retention, RPO/RTO and the legacy cut-over    |
| `specs/001-booking-platform-rewrite` | Specification, plan and task backlog for the rewrite          |
| `specs/002-dependency-modernization` | Specification and plan for the toolchain upgrade              |

## Documentation

- [`specs/001-booking-platform-rewrite/spec.md`](specs/001-booking-platform-rewrite/spec.md) —
  the functional specification and the capability matrix.
- [`specs/001-booking-platform-rewrite/quickstart.md`](specs/001-booking-platform-rewrite/quickstart.md) —
  a shorter setup and verification path.
- [`specs/001-booking-platform-rewrite/contracts/openapi.yaml`](specs/001-booking-platform-rewrite/contracts/openapi.yaml) —
  the API contract.
- [`specs/001-booking-platform-rewrite/data-model.md`](specs/001-booking-platform-rewrite/data-model.md) —
  the MongoDB collections and indexes.
- [`docs/operations.md`](docs/operations.md) — the operations runbook: backup cadence, restore
  procedure, archived-booking retention, RPO/RTO and the cut-over that retires the legacy system.
- [`AGENTS.md`](AGENTS.md) — the repository's load-bearing constraints and the traps that cost
  time during the dependency upgrade. Read it before making non-trivial changes.

## Toolchain versions

Node 24 · Nx 23.3.1 · Angular 22 · TypeScript 6.0.3 · NestJS 11.2.8 · Mongoose 9 · Express 5 ·
Jest 30 · ESLint 10 (flat config) · Cypress 16.

Several of these are **deliberate ceilings**, not lagging updates — Nx 23, NestJS 11 and
TypeScript 6.0.x are pinned because the next major of each breaks this workspace. The reasons
are recorded in [`AGENTS.md`](AGENTS.md) under "Version ceilings". Read that before bumping
anything.
