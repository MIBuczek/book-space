# Quickstart — Book Space rewrite

## Prerequisites

- Node.js 24 (`.nvmrc`) and Yarn 1.x
- Docker and Docker Compose (optional, for the containerised workflow)
- A MongoDB instance. Atlas or a local `mongod` both work; the database name is `book_space`.

## Configuration

Create `apps/server/.env` **locally** (never commit it):

```dotenv
PORT=3000
DB_URI=mongodb://localhost:27017/book_space
JWT_SECRET=<a long random value, at least 32 characters>
SEED_REFERENCE_DATA=false
SUMMARY_DENY_LIST=mkulakowski@umsiechnice.pl
MAIL_ENDPOINT=
MAIL_API_KEY=
MAIL_FROM=rezerwacje@sisk-siechnice.pl
SISK_CONTACT_EMAIL=biuro@sisk-siechnice.pl
```

`apps/server/.env` is not committed — it was purged from history in #61 and is now gitignored,
with `apps/server/.env.example` as the template. The server validates `DB_URI` and
`JWT_SECRET` at boot and refuses to start with a message naming what is wrong. Rotate the
legacy MongoDB user and JWT secret if that has not already been done (research.md R3). The
full key list, including the mail and deny-list variables, is in the
[README](../README.md#configuration).

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
docker compose up --build   # UI on :4200, API on :3000, MongoDB internal
```

The UI is served by nginx, which also proxies `/api` to the API container, so the browser only
talks to `http://localhost:4200`.

## Seed reference data

Facilities and cities are data, not constants (research.md R6). The twelve facilities from
spec.md section 4 are seeded from `apps/server/src/app/buildings/seed/facility-seed.ts` by
`ReferenceDataService`, which upserts each on its `{city, property}` key. The seed is
authoritative, so it only runs when asked:

```bash
SEED_REFERENCE_DATA=true yarn nx serve server   # or set it in apps/server/.env
```

Running it twice is safe: it matches on the key, so a second run leaves twelve documents
rather than adding twelve more, and it completes a partially seeded database rather than
skipping it. Then create one administrator account (T051).

The four cities are a string enum, not a collection, so seeding the twelve facilities _is_
seeding the four cities — there is no separate `/cities` resource.

## Verify the specification is met

Run the checks in this order; each maps to a section of the specification.

```bash
# 1. Lint and unit tests (every project, including the shared libraries)
yarn lint
yarn nx run-many --target=test --projects=server,ui,date-time,booking-rules,reporting,version,migration --configuration=ci

# 2. API end-to-end tests
yarn nx e2e server-e2e

# 3. UI end-to-end tests
yarn nx e2e ui-e2e
```

### Manual verification per user story

| Story                      | How to verify                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US1 public booking         | Open `http://localhost:4200` anonymously; confirm only accepted bookings appear; submit a request for a free slot with the RODO box ticked; confirm the record is stored with `accepted: false`                         |
| US2 authentication         | Sign in as an employee; confirm the city selector is locked and only Calendar and Bookings tabs appear; open `/admin` while signed out and confirm the redirect to `/sign-in`                                           |
| US3 approval and conflicts | Create two overlapping requests; confirm both are flagged and the counter increments; approve one with the conflict warning; archive it and confirm it leaves the list and reports                                      |
| US4 clients and facilities | As an office user, create a client of type `Firma` and confirm NIP is required; as an employee, confirm the Clients tab is absent                                                                                       |
| US5 reports                | Create accepted bookings for a client in two cities; generate a summary for one month and confirm the totals; export CSV and confirm one row per slot; confirm `mkulakowski@umsiechnice.pl` cannot open the Summary tab |
| US6 informational          | Open `/contact`; accept the cookie notice and reload to confirm it stays hidden; open an unknown route for the 404 page; simulate an API failure for the server-error page                                              |

### Security verification (SC-007)

```bash
yarn nx build ui --configuration=production
node tools/scan-bundle.js dist/apps/ui
```

The script exits non-zero if the built client assets contain a database URI, a Firebase key,
an EmailJS service or template id, a JWT-secret reference, a bearer-token literal, the mail
provider key, or a Gmail address. CI runs the same script on every PR, so the pattern list
cannot drift between the local check and the gate. It must report no findings.

## Migration dry run

```bash
# reads the legacy Firebase export, writes to a scratch database, prints reconciliation counts
nx run migration:run -- --source <firebase-export> --target mongodb://localhost:27017/book_space_staging --dry-run
```

Compare the reported counts per collection against the legacy database before cutting over
(SC-003).
