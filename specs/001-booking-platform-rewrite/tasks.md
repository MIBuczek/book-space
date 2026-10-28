# Tasks — Book Space rewrite

**Feature**: `001-booking-platform-rewrite` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Each task below becomes one GitHub issue. Task identifiers are stable and are used as the
issue-title prefix (`T001: …`). `[P]` marks a task that can run in parallel with its
siblings. `[US#]` maps the task to a user story in the specification.

Conventions: file paths are relative to the repository root. A task is only complete when its
acceptance criteria pass and the tests it names exist and are green.

---

## Phase 1 — Foundation and security (blocks everything)

- [ ] T001 [P] Rotate and remove committed secrets; add `.env` to `.gitignore` and a CI guard that fails on a committed `.env` or on a known key pattern. (FR/NFR-001, research.md R3)
- [ ] T002 [P] Add a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) and a global exception filter that returns the `Error`/`ValidationError` shapes in `contracts/openapi.yaml`. (NFR-003)
- [ ] T003 [P] Extend `libs/models` with the target types: `TClientType`, `TPayment` (`CASH|TRANSFER|FREE`), `TSingleBookingStatus` (`INITIAL|DONE|CANCELED`), `IPlace`, `IUser` with `role`/`city`/`buildings`, `IBooking`, `IBookedTime`, `ISelectedExtraOption`, `JwtPayload`, `IValidationError`. (plan.md, data-model.md)
- [ ] T004 [P] Add structured logging and a request correlation id. (NFR-008)
- [ ] T005 [P] Configure CI: lint, unit tests, build for both applications, and the secret guard from T001. (NFR-004, SC-008)
- [ ] T006 [P] Add a test harness for API integration tests: an ephemeral MongoDB instance (test container or in-memory server) with per-suite database reset. (NFR-004)

## Phase 2 — Data model and reference data

- [ ] T007 [US2] Extend the `users` schema with `role` (`ADMIN|OFFICE|EMPLOYEE`), `city`, `buildings`, `active`; add a serialiser that never returns `password`; fix password hashing so update paths re-hash correctly; enforce `recheckPassword` equality in the DTO. (FR-002, FR-004, data-model.md users, CHK017)
- [ ] T008 [US4] Extend the `clients` schema with `nick`, audit timestamps, and the NIP-required-for-`COMPANY` rule; align `zipCode` validation between schema and DTO. (FR-025, FR-026, data-model.md clients)
- [ ] T009 [US4] Extend the `buildings` schema with `property`, `sizes`, `lighting`, `toilets`, employee references; add the uniqueness constraint on `property` + `city`. (FR-007, FR-008, FR-009, data-model.md buildings)
- [ ] T010 [US1] Extend the `bookings` schema with `nick`, `discount`, `extraOptions`, `selectedOptions` and the audit fields; reconcile `paymentMethod` to `CASH|TRANSFER|FREE`; add the indexes for facility+month, client and recency. (FR-011, FR-016, FR-043, CHK015)
- [ ] T011 [US1] Add `endHours > startHours` validation to `BookedTime`, coerce `participants` to a number, and rename the file `booked-time.schemta.ts` → `booked-time.schema.ts`. (FR-012, data-model.md bookedTimes)
- [ ] T012 [US4] Seed the four cities and twelve facilities from `spec.md` §4 as idempotent seed data, and expose them through `GET /api/buildings`. (FR-007, research.md R6)

## Phase 3 — Authentication and authorisation

- [ ] T013 [US2] Complete the auth module: `/auth/sign-in` returns the user without the password hash, `/auth/me` returns the current user with resolved role and assignments, `/auth/sign-out` is documented as stateless, and failures never reveal whether the e-mail exists. (FR-001, FR-002, contracts/authorization-matrix.md)
- [ ] T014 [US2] Add a `RolesGuard` and a `@Roles(...)` decorator, plus a `@CurrentUser()` decorator, implementing the capability matrix. (FR-003, FR-004, FR-005)
- [ ] T015 [US2] Restrict every `users` endpoint to administrators and add integration tests proving an employee receives `403`. (authorization matrix note 1, FR-004)
- [ ] T016 [US1] Restrict the public booking read path so an anonymous caller receives only accepted, non-archived bookings with `personName`, `personEmail`, `personPhone` and `comments` removed. (FR-005, authorization matrix note 6)
- [ ] T017 [US3] Enforce booking ownership: an exact identity comparison replaces the e-mail-substring check, so a non-admin staff member can only edit or delete bookings they created. (FR-023, authorization matrix note 4)

## Phase 4 — Booking domain logic

- [ ] T018 [US3] Implement server-side conflict detection as a pure, unit-tested function reproducing the legacy semantics (same day, month match, overlapping hour ranges, accepted bookings excluded). (FR-015, research.md R5, SC-002)
- [ ] T019 [US1] Implement cyclical booking expansion on the server, with the week-count calculation corrected and covered by tests including a year boundary. (FR-013, spec.md edge cases)
- [ ] T020 [US3] Add `POST /api/bookings/{_id}/approve` and `POST /api/bookings/{_id}/archive`; approval returns the conflicts and requires `force` to proceed when conflicts exist. (FR-017, contracts/openapi.yaml)
- [ ] T021 [US3] Block editing or deleting a time slot whose status is not `INITIAL`, on the server, with a clear error. (FR-018, FR-017)
- [ ] T022 [US1] Add period filtering and pagination to `GET /api/bookings` (from/to, city, building, accepted, archive, clientId, page, limit) and replace the unbounded read. (FR-020, FR-022, FR-043, research.md R9)
- [ ] T023 [US1] Implement the booking creation path for public callers including RODO acknowledgement, and the `PUT /api/bookings/{_id}/booked-times` replacement that preserves resolved slots. (FR-011, FR-012, research.md R5)
- [x] ~~T024 [US4] Fix the client and facility delete routes (`@Delete('_id')` → `@Delete(':_id')`) and add regression tests.~~ **Moved to `002-dependency-modernization` U027 (#88)**, which also renames the buildings controller's copy-pasted `...Client` handlers. Issue #28 closed as a duplicate. (authorization matrix note 3, CHK016)
- [ ] T025 [US4] Restrict client and facility writes to the roles in the capability matrix and add tests for each role. (FR-010, FR-024, FR-004)

## Phase 5 — Reporting and notifications

- [ ] T026 [US5] Implement `GET /api/reporting/summary` producing the per-client, per-city summary for a month range or from the beginning, counting only accepted bookings and including bookings without a linked client where the client is identified by name. (FR-027, research.md R11)
- [ ] T027 [US5] Implement `GET /api/reporting/summary.csv` with the exact legacy column set and order, `;` separator and UTF-8 BOM, for one client and for all clients. (FR-028, FR-029, research.md R7)
- [ ] T028 [US5] Implement the printable PDF report without depending on a deployed production URL. (FR-030, research.md R7)
- [ ] T029 [US5] Enforce the Summary deny-list through configuration rather than a hardcoded account, and cover it with a test. (FR-006, open question 3)
- [ ] T030 [US1] Implement the notification module against a server-side provider: facility notification on staff create/update (opt-in), staff notification on public request, and a failure that never rolls back the booking. (FR-032, FR-033, FR-035, FR-036, research.md R8)
- [ ] T031 [US6] Implement contact-form and facility-employee message delivery through the same provider. (FR-034, FR-041)

## Phase 6 — Angular UI

- [ ] T032 [P] UI foundation: application shell, routing for public and admin areas, HTTP interceptor attaching the bearer token, 401 handling, an error boundary, and a shared UI kit (button, input, select, checkbox, table, modal, pagination, date picker). (FR-039, NFR-006)
- [ ] T033 [US2] Sign-in page, auth service with token storage, route guards for the admin area, and role-based navigation. (FR-001, FR-004, contracts/authorization-matrix.md)
- [ ] T034 [US1] Public calendar: city and facility selectors, weekly/day/list views, event rendering with the accepted/unaccepted/quit colouring and the "only accepted bookings" notice. (FR-037, FR-038)
- [ ] T035 [US1] Public booking request form: tenant fields, size selection limited to the facility's sizes, multi-slot entry, cyclical option, extra options for facilities that support them, RODO acknowledgement, and client-side validation mirroring the server. (FR-011, FR-012, FR-013)
- [ ] T036 [US3] Admin bookings table: search, unapproved filter, conflict indicator and counter, expandable rows, pagination with selectable page size, period loader, and the approve/edit/reschedule/resolve/archive/delete actions. (FR-017, FR-018, FR-020, FR-021, FR-022)
- [ ] T037 [US4] Admin clients tab: list, search, create, edit, delete, with the NIP rule driven by client type. (FR-024, FR-025)
- [ ] T038 [US4] Admin facilities tab: facility details, employee list and the message-to-employee action. (FR-009, FR-041)
- [ ] T039 [US5] Admin summary tab: client selector, month range, from-the-beginning option, generated totals per city, CSV download and the printable report. (FR-027, FR-028, FR-029, FR-030)
- [ ] T040 [US6] Informational surfaces: contact page, cookie notice with persistence, 404 page, server-error page and privacy link. (FR-039, FR-040)

## Phase 7 — Migration and cut-over

- [ ] T041 [P] Build the migration tool: read the legacy Firebase collections, transform them per `research.md` R10, write to MongoDB, and print per-collection reconciliation counts. (FR-042)
- [ ] T042 [P] Add migration tests covering every documented transformation: `bookingTime` → `bookedTimes`, `person` → `personName`, `invoice` → `transfer`, `QUIT` → `CANCELED`, role flags → `role`, defaults for missing fields, and `participants` string-to-number coercion. (FR-042, SC-003)
- [ ] T043 Execute the migration against a staging database, reconcile counts and a sampled field-by-field comparison, then record the sign-off. (SC-003)
- [ ] T044 Update `README.md`, `quickstart.md` and the deployment documentation, including the configuration keys and the Docker workflow. (NFR-010)

## Phase 8 — Verification

- [ ] T045 [P] Unit tests for conflict detection, cyclical expansion, report aggregation, permission checks and validation, achieving at least 80 % coverage of the domain modules. (SC-001, SC-008)
- [ ] T046 [P] Integration tests for every endpoint asserting both the success and the forbidden/unauthorised outcome per role. (SC-001)
- [ ] T047 [P] End-to-end tests for the P1 journeys: public request, sign-in and role-based navigation. (NFR-004)
- [ ] T048 Accessibility pass: keyboard reachability, form-error announcements, and a non-colour conflict indicator. (NFR-006)
- [ ] T049 Verify SC-007 by building the UI and grepping the output for secrets, and record the result. (SC-007)
- [ ] T050 Performance check: booking list and calendar load, and summary CSV generation for a client with 200 bookings. (SC-006, NFR-009)

---

## Dependency notes

- Phase 1 blocks all other phases.
- T007–T012 (Phase 2) can proceed in parallel once T003 lands.
- T013–T017 (Phase 3) depend on T007 and T014.
- T018–T025 (Phase 4) depend on T010, T011 and T014.
- T026–T029 (Phase 5) depend on T022 for paged reads.
- Phase 6 can start against the OpenAPI contract once T002 and T013 land; T034–T036 additionally
  depend on T022.
- T041 and T042 can start as soon as T007–T011 define the target schema.
- T043 depends on T041, T042 and a complete Phase 4.
- Phase 8 tasks run alongside Phase 6 and 7 and gate the release.
