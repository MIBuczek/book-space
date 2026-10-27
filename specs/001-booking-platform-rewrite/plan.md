# Implementation Plan: Book Space — Municipal Sports Facility Booking Platform

**Branch**: `001-booking-platform-rewrite` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-booking-platform-rewrite/spec.md`

## Summary

Replace the client-only React/Firebase application (`MIBuczek/sisk-booking-app` v1.3.6) with
the Nx monorepo in `MIBuczek/book-space`: an Angular 16 UI talking to a NestJS 9 API over
REST, backed by MongoDB via Mongoose. The API skeleton, Mongoose schemas, DTO validation
and JWT authentication already exist; the Angular application is still the Nx starter shell
and no feature UI, authorisation guards, reporting or notification logic exists yet.

The work is therefore: (1) finish and harden the API — authorisation, conflict detection,
reporting, notification, migration; (2) build the Angular feature UI — public calendar and
request flow, staff admin panel; (3) establish quality gates — unit, integration and
end-to-end tests plus CI.

## Technical Context

**Language/Version**: TypeScript 5.0 (server target ES2015/Node 18, UI Angular 16)

**Primary Dependencies**:
- API: NestJS 9, Mongoose 7, `@nestjs/jwt` 10, `passport-jwt`, `bcrypt`, `class-validator`,
  `class-transformer`, `cookie-parser`
- UI: Angular 16 (standalone components), RxJS 7.8
- Calendar: FullCalendar (legacy used `@fullcalendar/react` 6.x) or an Angular equivalent
- Reports: CSV generation on the client or server; PDF via a print view or a PDF library

**Storage**: MongoDB (Atlas or self-hosted). Database name `book_space`. Collections:
`users`, `clients`, `buildings`, `bookings` (with embedded `bookedTimes`).

**Testing**: Jest for API unit and integration tests (`@nx/jest`); Jest + Angular TestBed for
UI unit tests; Cypress for UI end-to-end (`@nx/cypress`); `apps/server-e2e` for API
end-to-end. Test containers or an in-memory Mongo instance for integration tests.

**Target Platform**: Linux containers. Two deployable images (`ui`, `server`) orchestrated by
the existing `docker-compose.yml`; `nginx` (or equivalent) serves the built Angular assets and
proxies `/api`.

**Project Type**: Web application — Nx monorepo with a backend and a frontend application,
plus a shared models library.

**Performance Goals**: booking list and calendar interactive within 2 s for a typical year of
data; summary CSV generation under 3 s for 200 bookings.

**Constraints**: Polish-only user interface for the first release; no secrets in client
assets; all authorisation enforced server-side; Europe/Warsaw time-zone semantics.

**Scale/Scope**: 4 cities, 12 facilities, low hundreds of staff and clients, thousands of
bookings per year; single municipality tenant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file is present in the repository yet (`.specify/memory/constitution.md` is the
unfilled template). The following gates are adopted for this feature and MUST be recorded in
the constitution when it is ratified:

1. **Server-side enforcement** — no business rule that protects data may exist only in the UI.
2. **Single source of truth for types** — shared request/response types live in `libs/models`
   and are consumed by both applications.
3. **No secrets in the client bundle** — configuration is injected at runtime or served by the API.
4. **Test-first for domain logic** — conflict detection, cyclical expansion, report generation
   and permission checks require unit tests before implementation.
5. **Migration is reversible** — the legacy Firebase project stays intact until reconciliation
   passes.

All planned work below satisfies these gates.

## Project Structure

### Documentation (this feature)

```text
specs/001-booking-platform-rewrite/
├── spec.md              # Feature specification (/speckit.specify output)
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — decisions and rejected alternatives
├── data-model.md        # Phase 1 output — collections, documents, validation
├── quickstart.md        # Phase 1 output — local run and verification
├── contracts/           # Phase 1 output — REST contract, error format, roles matrix
│   ├── openapi.yaml
│   └── authorization-matrix.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks — not created by this command)
```

### Source Code (repository root)

```text
libs/
└── models/                       # shared types: booking, booked-time, client, building,
                                  # user, jwt-payload, validation-error, place, payment

apps/
├── server/
│   ├── src/
│   │   ├── main.ts                       # bootstrap, CORS, cookie parser, global prefix /api
│   │   ├── app/
│   │   │   ├── app.module.ts             # root module: config, JWT, Mongoose, feature modules
│   │   │   ├── authorization/            # sign-in / sign-out, JWT strategy, DTOs
│   │   │   ├── users/                    # staff accounts, roles
│   │   │   ├── clients/                  # tenant directory
│   │   │   ├── buildings/                # cities and facilities
│   │   │   ├── bookings/                 # bookings + embedded booked times
│   │   │   ├── notification/             # outbound e-mail (currently an empty shell)
│   │   │   ├── reporting/                # TO BUILD — summaries, CSV, PDF data
│   │   │   └── utility/                  # validation-error mapping, guards, decorators
│   │   └── assets/
│   └── project.json
├── ui/
│   └── src/
│       ├── main.ts                       # bootstrapApplication (standalone APIs)
│       └── app/
│           ├── app.routes.ts             # TO BUILD — feature routes
│           ├── core/                     # TO BUILD — auth service, interceptors, guards
│           ├── shared/                   # TO BUILD — UI kit, pipes, validators
│           ├── features/
│           │   ├── public-calendar/      # TO BUILD — US1
│           │   ├── booking-request/      # TO BUILD — US1
│           │   ├── auth/                 # TO BUILD — US2
│           │   ├── admin-bookings/       # TO BUILD — US3
│           │   ├── admin-clients/        # TO BUILD — US4
│           │   ├── admin-facilities/     # TO BUILD — US4
│           │   ├── admin-summary/        # TO BUILD — US5
│           │   └── info-pages/           # TO BUILD — US6
│           └── app.component.ts
└── server-e2e/                   # API end-to-end tests (extend)
└── ui-e2e/                       # UI end-to-end tests (extend)

tools/
└── migration/                    # TO BUILD — Firebase → MongoDB migration
```

**Structure Decision**: keep the existing Nx layout (`apps/server`, `apps/ui`,
`apps/server-e2e`, `apps/ui-e2e`, `libs/models`) because it is already scaffolded, wired by
`nx.json`, and reflected in `tsconfig.base.json` path aliases. New capability is added as
NestJS feature modules under `apps/server/src/app` and as Angular standalone feature folders
under `apps/ui/src/app/features`. Shared types are extended in `libs/models` rather than
duplicated. A new `tools/migration` project holds the one-off Firebase import.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Separate `reporting` module | Reporting aggregates across clients, bookings and facilities and has its own contract and tests | Folding it into `bookings` mixes read models with the write model and makes the CSV/PDF contract hard to test in isolation |
| `tools/migration` project | Legacy data must be transformed (missing fields, `invoice` → `transfer`, `bookingTime` → `bookedTimes`, denormalised city/building → reference) | A one-off script inside the server would ship migration code into production and would not be independently runnable or testable |
| Embedded `bookedTimes` documents | The legacy model treats slots as part of one request, and every slot is written with the parent | A separate collection adds a join and a transaction for every booking write with no query benefit at this scale |
