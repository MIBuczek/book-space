# Quickstart — Book Space rewrite

## Prerequisites

- Node.js 18 and Yarn 1.x
- Docker and Docker Compose (optional, for the containerised workflow)
- A MongoDB instance. Atlas or a local `mongod` both work; the database name is `book_space`.

## Configuration

Create `apps/server/.env` **locally** (never commit it):

```dotenv
PORT=3000
DB_URI=mongodb://localhost:27017/book_space
JWT_SECRET=<a long random value>
MAIL_PROVIDER_API_KEY=<provider key>
MAIL_FROM=rezerwacje@sisk-siechnice.pl
```

`apps/server/.env` is currently committed with live credentials. Rotate the MongoDB user and
the JWT secret, then remove the file from version control and add it to `.gitignore`
(research.md R3).

## Install and run

```bash
yarn install

# both applications
yarn start:all

# individually
yarn start:server     # http://localhost:3000/api
yarn start:ui         # http://localhost:4200
```

Or with Docker:

```bash
docker compose up --build   # ui on :4200, api on :3000
```

## Seed reference data

Facilities and cities are data, not constants (research.md R6). Seed the four cities and the
twelve facilities from spec.md section 4, then create one administrator account.

## Verify the specification is met

Run the checks in this order; each maps to a section of the specification.

```bash
# 1. Lint and unit tests
yarn lint
nx run-many --target=test --projects=server,ui

# 2. API end-to-end tests
nx e2e server-e2e

# 3. UI end-to-end tests
nx e2e ui-e2e
```

### Manual verification per user story

| Story | How to verify |
|-------|---------------|
| US1 public booking | Open `http://localhost:4200` anonymously; confirm only accepted bookings appear; submit a request for a free slot with the RODO box ticked; confirm the record is stored with `accepted: false` |
| US2 authentication | Sign in as an employee; confirm the city selector is locked and only Calendar and Bookings tabs appear; open `/admin` while signed out and confirm the redirect to `/login` |
| US3 approval and conflicts | Create two overlapping requests; confirm both are flagged and the counter increments; approve one with the conflict warning; archive it and confirm it leaves the list and reports |
| US4 clients and facilities | As an office user, create a client of type `Firma` and confirm NIP is required; as an employee, confirm the Clients tab is absent |
| US5 reports | Create accepted bookings for a client in two cities; generate a summary for one month and confirm the totals; export CSV and confirm one row per slot; confirm `mkulakowski@umsiechnice.pl` cannot open the Summary tab |
| US6 informational | Open `/contact`; accept the cookie notice and reload to confirm it stays hidden; open an unknown route for the 404 page; simulate an API failure for the server-error page |

### Security verification (SC-007)

```bash
yarn build:all
grep -rInE 'mongodb\+srv|AIza[0-9A-Za-z_-]{35}|service_[a-z0-9]{7}|JWT_SECRET' dist/apps/ui
```

The command must produce no matches: no database URI, Firebase key, mail-service identifier or
JWT secret may appear in the built client assets.

## Migration dry run

```bash
# reads the legacy Firebase export, writes to a scratch database, prints reconciliation counts
nx run migration:run -- --source <firebase-export> --target mongodb://localhost:27017/book_space_staging --dry-run
```

Compare the reported counts per collection against the legacy database before cutting over
(SC-003).
