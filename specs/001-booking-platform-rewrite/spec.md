# Feature Specification: Book Space — Municipal Sports Facility Booking Platform (Rewrite)

**Feature Branch**: `001-booking-platform-rewrite`

**Created**: 2026-10-27

**Status**: Draft

**Input**: Rewrite of `MIBuczek/sisk-booking-app` (React 18 + Redux + Firebase, v1.3.6) as
`MIBuczek/book-space` (Nx monorepo: Angular UI + NestJS API + MongoDB).

**Source of truth for current behaviour**: the legacy SPA at
`https://sisk-booking-tool.netlify.app/#/` (repo `MIBuczek/sisk-booking-app`, tag `1.3.6`).
Every functional requirement below is traceable to code in that repository.

---

## 1. Context and Problem Statement

Siechnicka Inwestycyjna Spółka Komunalna (SISK) runs four municipal locations
(Siechnice, Radwanice, Święta Katarzyna, Żerniki Wrocławskie) containing 13 rentable
sport facilities (halls, fitness rooms, pitches, courts, Orlik). Hourly bookings are
requested by the public and approved by SISK staff.

The current application is a client-only React SPA that talks to Firebase directly:

- All business rules (conflict detection, permissions, report generation, CSV/PDF
  output) run in the browser. Firebase security rules grant any authenticated user
  read/write on the whole database, so the rules are not enforced server-side.
- Two Firebase projects are embedded in the source, including API keys, and EmailJS
  service/template/user identifiers are hardcoded in the bundle.
- There are no automated tests, no typed API contract, and no server-side validation.
- A partial rewrite exists in `MIBuczek/book-space` (Nx + Angular 16 + NestJS 9 +
  MongoDB). It contains the API skeleton, MongoDB schemas, JWT auth and DTO
  validation, but the Angular UI is still the Nx starter shell.

This specification defines the full target system so the rewrite can be planned,
scoped, and delivered in independently testable slices.

## 2. Scope

**In scope**: public booking request flow, staff administration of bookings, clients,
facilities and users, role-based access control, conflict detection, summary reports
(CSV/PDF), outbound e-mail notifications, static pages (contact, cookie notice, 404,
server error), data migration from the legacy Firebase database.

**Out of scope (unless explicitly requested later)**: online payment processing,
self-service account registration by the public, mobile native apps, multi-tenant
support for municipalities other than SISK, SMS notifications.

---

## 3. Roles

| Role | Legacy flag | Capabilities |
|------|-------------|--------------|
| Public visitor (anonymous) | no account | Browse the calendar of **accepted** bookings, submit a booking request, send a contact message, read contact page |
| Employee (`isEmployee`) | `isEmployee: true` | Everything a visitor can do, plus see all bookings for their facility, resolve booking status, edit requests |
| Office (`isOffice`) | `isOffice: true` | Employee capabilities, plus the Clients, Facilities and Summary tabs |
| Administrator (`isAdmin`) | `isAdmin: true` | All capabilities, plus approve/reject bookings, archive bookings, manage users, see the "show bookings awaiting approval" filter, see conflict counts |

Legacy derivation of rights (see `credentials-function.ts` in the source repo):

- `hasRightsToSeeContent` = `isAdmin || isEmployee || isOffice`
- `adminCredentials` = `isAdmin` only
- `siskEmployeeCredentials` = `isAdmin || isOffice || isEmployee`
- `adminSeeContentCredentials` = `isAdmin || isOffice` (controls Clients/Facilities/Summary tabs)
- `summaryUserRestriction` = `isAdmin || isOffice`, **except** the account
  `mkulakowski@umsiechnice.pl`, which is denied the Summary tab (legacy issue #73)

## 4. Locations and Facilities (current reference data)

Legacy data lives in `building-data-const.ts`. Target system stores it in MongoDB.

| City | Facility | Property key | Rentable sizes | Lighting | Toilets |
|------|----------|--------------|----------------|----------|---------|
| Siechnice | Hala sportowa | `hala-sportowa` | 1/3, 2/3, 1/1 | no | no |
| Siechnice | Sala fitness | `sala-fitness` | 1/1 | no | no |
| Siechnice | Boisko ze sztuczną nawierzchnią | `boisko-sztuczna-nawierzchnia` | 1/1, 1/2, 1/4, 3/4 | yes | yes |
| Siechnice | Boisko trawiaste na stadionie LA | `boisko-trawiaste-stadionie-la` | 1/1, 1/2, 1/4, 3/4 | no | no |
| Siechnice | Orlik | `orlik` | 1/1, 1/2 | no | no |
| Siechnice | KORT#1 | `kort_1` | 1/1 | no | no |
| Siechnice | KORT#2 | `kort_2` | 1/1 | no | no |
| Radwanice | Hala sportowa | `hala-sportowa` | 1/1, 1/2 | no | no |
| Radwanice | Sala fitness | `sala-fitness` | 1/1 | no | no |
| Święta Katarzyna | Hala sportowa | `hala-sportowa` | 1/1, 1/2 | no | no |
| Żerniki Wrocławskie | Hala sportowa | `hala-sportowa` | 1/1, 1/2 | no | no |
| Żerniki Wrocławskie | Sala fitness | `sala-fitness` | 1/1 | no | no |

Notes: the legacy `IBuilding.extra` object carries `lighting`/`toilets` flags but the
only facility with both set to `true` is `boisko-sztuczna-nawierzchnia`; the
`BookingExtraOptions` form is only rendered for that facility. Facility `property`
is only unique per city — it is **not** a global identifier.

---

## 5. User Scenarios and Testing

### User Story 1 — Public visitor browses availability and requests a booking (Priority: P1)

An anonymous visitor opens the application, picks a city and a facility, sees the
weekly calendar with all approved bookings, and submits an hourly booking request.

**Why this priority**: this is the only public-facing journey; without it the
application has no purpose.

**Independent Test**: with a seeded database containing at least one accepted booking,
open the calendar anonymously, confirm only accepted bookings appear, submit a request
for a free slot, and confirm the request is persisted with `accepted = false`.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** the calendar loads, **Then** only bookings
   with `accepted = true` and `archive = false` are shown, and the notice "W kalendarzu
   są widoczne tylko zatwierdzone przez administratora rezerwacje" is displayed.
2. **Given** a visitor on a free slot, **When** they submit a request with valid data
   and accept the RODO clause, **Then** the request is stored with `accepted = false`
   and a confirmation is shown.
3. **Given** a visitor who has not ticked the RODO clause, **When** they try to submit,
   **Then** the submit button is disabled.
4. **Given** a request being submitted, **When** the request is for a date in the past,
   **Then** the date picker prevents selecting it (`minDate = today` for non-admins).
5. **Given** a successful submission, **When** the notification flag is enabled,
   **Then** an e-mail is sent to the facility address and to SISK staff.

---

### User Story 2 — Staff authenticates and sees their facility workspace (Priority: P1)

A staff member signs in with e-mail and password, lands on the admin panel, and is
pinned to the city they are assigned to.

**Why this priority**: no administrative work is possible without authentication, and
the whole approval workflow depends on it.

**Independent Test**: sign in as a user whose `city` is `radwanice`, confirm the
landing tab is the calendar, that the city selector is locked to Radwanice, and that
tabs are shown/hidden according to the user's role flags.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** the user signs in, **Then** a JWT is issued
   and the user is routed to the admin panel.
2. **Given** invalid credentials, **When** the user signs in, **Then** a generic
   "incorrect e-mail or password" message is shown and no session is created.
3. **Given** an authenticated employee, **When** the panel renders, **Then** the
   city selector is locked to the user's assigned city and only the Calendar and
   Bookings tabs are visible.
4. **Given** an authenticated administrator, **When** the panel renders, **Then**
   Calendar, Bookings, Clients, Facilities and Summary tabs are visible.
5. **Given** an unauthenticated visitor, **When** they open `/admin`, **Then** they
   are redirected to the login page.
6. **Given** an authenticated user, **When** they sign out, **Then** the session is
   terminated and the login page is shown.

---

### User Story 3 — Administrator approves, rejects, reschedules and archives bookings (Priority: P2)

An administrator reviews incoming requests, sees conflicts, approves or rejects them,
adjusts individual time slots, and archives completed bookings.

**Why this priority**: it is the core administrative workload, but the platform is
already usable for requesting bookings without it.

**Independent Test**: create two overlapping requests, confirm both are flagged as
conflicting, approve one, confirm the other still conflicts, then archive the approved
one and confirm it disappears from default lists and reports.

**Acceptance Scenarios**:

1. **Given** two unapproved bookings overlapping in time on the same facility and
   month, **When** the administrator opens the bookings list, **Then** both are
   marked as conflicting and a conflict counter is shown.
2. **Given** a conflicting booking, **When** the administrator approves it anyway,
   **Then** a confirmation warning is shown before the change is saved.
3. **Given** an approved booking, **When** an administrator archives it, **Then** it
   is excluded from lists, the calendar and reports, but is retained in storage.
4. **Given** an approved booking, **When** a staff member resolves a single time
   slot with a status, **Then** the status is one of `INITIAL`, `DONE`, `QUIT`,
   participants and comments are stored on that slot only.
5. **Given** a resolved (non-`INITIAL`) time slot, **When** a staff member tries to
   edit or delete that slot, **Then** the action is blocked with an explanatory message.
6. **Given** a booking created by a non-admin staff member, **When** a different
   non-admin staff member views it, **Then** they cannot edit or delete it.

---

### User Story 4 — Staff manages clients and facility data (Priority: P3)

Office and administrator users maintain the tenant (client) directory and review
facility details including the assigned employees.

**Why this priority**: valuable for data quality, but bookings can be created without
a linked client record.

**Independent Test**: create a client, edit it, search for it, delete it, and confirm
the list and the booking form's client selector reflect each change.

**Acceptance Scenarios**:

1. **Given** an office or administrator user, **When** they open the Clients tab,
   **Then** they can create, edit, search and delete clients; employees cannot.
2. **Given** a client of type `Firma`, **When** the form is rendered, **Then** the
   NIP field is required; for type `Indywidualny` it is hidden.
3. **Given** a client, **When** an administrator picks it in the booking form,
   **Then** name, e-mail and phone can be auto-filled into the booking.
4. **Given** the Facilities tab, **When** a facility is selected, **Then** its
   contact details and the list of assigned employees are shown, and a message can
   be sent to a chosen employee.

---

### User Story 5 — Staff generates rental summary reports (Priority: P3)

An administrator or office user generates a per-client summary of rented hours for a
date range, exports it as CSV, and prints a PDF; a combined CSV for all clients is
also available.

**Why this priority**: needed for invoicing and settlement, but on a monthly rather
than daily cadence.

**Independent Test**: with a client having accepted bookings in two cities across
two months, generate a summary for one month and confirm the totals and the CSV/PDF
content match the bookings in range.

**Acceptance Scenarios**:

1. **Given** a client and a month range, **When** a summary is generated, **Then**
   only accepted bookings inside the range are counted, grouped by city.
2. **Given** the "from the beginning" option, **When** a summary is generated,
   **Then** all accepted bookings for that client are included regardless of date.
3. **Given** a generated summary, **When** the user exports CSV, **Then** the file
   contains one row per booked slot with client, facility, size as a percentage,
   payment method, discount, date, hours, participants and status.
4. **Given** the Summary tab, **When** the user account is `mkulakowski@umsiechnice.pl`,
   **Then** the tab is not available.
5. **Given** the "all clients" export, **When** it is generated, **Then** it contains
   rows for every client with accepted bookings in the selected range.

---

### User Story 6 — Visitors use the informational surfaces (Priority: P4)

Visitors read the contact page, the cookie notice, the privacy link and can send a
contact message; unknown routes and server failures produce friendly pages.

**Why this priority**: legal and support requirements; independent of the booking core.

**Independent Test**: open `/contact`, `/` with an unknown hash route, and a simulated
server failure; confirm the correct content and that the cookie notice is remembered.

**Acceptance Scenarios**:

1. **Given** a first-time visitor, **When** the page loads, **Then** the cookie notice
   is shown; after accepting it is not shown again.
2. **Given** an unknown route, **When** it is opened, **Then** a 404 page with a link
   back to the calendar is shown.
3. **Given** a data-loading failure, **When** it occurs, **Then** a server-error page
   with phone and e-mail contact details is shown.
4. **Given** the contact form, **When** a visitor submits it with the RODO clause
   accepted, **Then** the message is delivered to the SISK inbox.

---

### Edge Cases

- Booking spanning midnight or ending before it starts (legacy validation compares
  start and end and rejects `start - end > 50 ms`).
- Cyclical booking: a weekly repeat between a start and end day; the legacy
  generator rounds the week count and can produce an off-by-one extra occurrence.
- A booking with several time slots where only some are resolved (`DONE`/`QUIT`):
  resolved slots must survive re-generation of the slot list, unresolved ones are
  replaced.
- Time-zone handling: the legacy code manually offsets hours to CET/CEST
  (`formatDisplayTime`, `overwriteDate`). The rewrite must use a single, documented
  time-zone strategy (Europe/Warsaw).
- Year boundary: the date picker's maximum date is extended by one year when the
  current month is August or later, or when the user is an administrator.
- A facility with the same `property` in two cities (e.g. `hala-sportowa`) — the
  city must always be part of the identity.
- Concurrent approval of two overlapping requests by two administrators.
- Legacy records missing newer fields (`createdBy`, `createdAt`, `modifiedBy`,
  `modifiedAt`, `nick`, `participants`, `discount`) — the migration must supply
  defaults (`createdBy` defaulted to `michal.hoffman@sisk-siechnice.pl`, `modifiedBy`
  to `Unknown`).
- Legacy `payment` value `invoice` is mapped to `transfer` on read.

---

## 6. Requirements

### 6.1 Functional Requirements

**Authentication and authorisation**

- **FR-001**: The system MUST authenticate staff by e-mail and password and issue a
  signed token with a defined expiry.
- **FR-002**: The system MUST store passwords only as a salted hash; plaintext
  passwords MUST never be persisted or logged.
- **FR-003**: The system MUST enforce all authorisation rules server-side on every
  endpoint. Client-side hiding of controls is a usability aid only.
- **FR-004**: The system MUST support the four roles in section 3 with the capability
  matrix given there.
- **FR-005**: The system MUST restrict every read and write to the caller's
  permitted scope; a public visitor MUST only be able to read accepted, non-archived
  bookings.
- **FR-006**: The system MUST provide a deny-list for the Summary feature so that the
  account `mkulakowski@umsiechnice.pl` cannot access it (legacy issue #73).

**Facilities and locations**

- **FR-007**: The system MUST store cities and facilities as data, not as compiled-in
  constants, and MUST expose them to the UI.
- **FR-008**: The system MUST associate each facility with one or more rentable sizes
  and with the list of employees responsible for it.
- **FR-009**: The system MUST expose facility contact details (e-mail, phone) and
  whether lighting and sanitary facilities are available.
- **FR-010**: The system MUST allow an office or administrator user to create, update
  and delete facilities.

**Bookings**

- **FR-011**: The system MUST allow a public visitor to submit a booking request
  containing: client type, city, facility, rentable size, nickname (label shown in the
  calendar), tenant name, club (optional), e-mail, phone, payment method, discount,
  one or more time slots, an optional message, and a RODO acknowledgement.
- **FR-012**: The system MUST support one or more time slots per booking, each with
  day, start hour, end hour, status, participant count and comments.
- **FR-013**: The system MUST support a cyclical booking option that expands a weekly
  repeat between two dates into individual time slots.
- **FR-014**: The system MUST persist bookings with a lifecycle: unapproved request →
  approved → archived, and each slot additionally carries `INITIAL`/`DONE`/`QUIT`.
- **FR-015**: The system MUST detect and report time conflicts between unapproved
  bookings on the same facility and month, and MUST warn an administrator before an
  approval that would keep a conflict.
- **FR-016**: The system MUST record who created and who last modified a booking and
  when.
- **FR-017**: The system MUST allow an administrator to approve, reject (unapprove),
  edit, reschedule individual slots, resolve individual slots and archive a booking.
- **FR-018**: The system MUST prevent editing or deleting a time slot that has been
  resolved (status other than `INITIAL`).
- **FR-019**: The system MUST allow an administrator to assign a client record to a
  booking and to auto-fill tenant fields from that client.
- **FR-020**: The system MUST allow bookings to be loaded for a selected period
  (current academic year, previous years, or all records) rather than always loading
  everything.
- **FR-021**: The system MUST allow filtering bookings to those awaiting approval and
  searching bookings by tenant name.
- **FR-022**: The system MUST paginate booking and client lists, with a selectable
  page size.
- **FR-023**: The system MUST prevent non-admin staff from editing or deleting a
  booking they did not create.

**Clients**

- **FR-024**: The system MUST allow office and administrator users to create, read,
  update, delete and search client records.
- **FR-025**: A client record MUST contain type (`Indywidualny`/`Firma`), name,
  contact person, phone, e-mail, street, city, postal code and, for companies, NIP.
- **FR-026**: The system MUST reject duplicate or malformed client data according to
  server-side validation rules.

**Reporting**

- **FR-027**: The system MUST generate a per-client rental summary grouped by city,
  for a month range or from the beginning, counting only accepted bookings.
- **FR-028**: The system MUST export the summary as a semicolon-separated CSV file
  with the columns currently defined in `csv-file-headers.ts`.
- **FR-029**: The system MUST export a combined CSV for all clients over a selected
  range.
- **FR-030**: The system MUST produce a printable PDF view of a client summary.
- **FR-031**: The system MUST express rented area as a percentage of the facility
  (e.g. `1/3` → `33%`).

**Notifications**

- **FR-032**: The system MUST send a notification e-mail to the facility address when
  a booking is created or updated by staff, when the operator opts in.
- **FR-033**: The system MUST notify SISK staff when a public booking request is
  submitted.
- **FR-034**: The system MUST allow a contact-form message to be delivered to the SISK
  inbox, and a facility message to a selected employee.
- **FR-035**: The system MUST keep notification credentials and recipients in
  server-side configuration, never in the client bundle.
- **FR-036**: The system MUST NOT let a notification failure roll back or lose an
  already-persisted booking; the failure MUST be surfaced to the operator.

**Public and informational surfaces**

- **FR-037**: The system MUST show a weekly calendar of accepted bookings with
  week/day/list views, and a month-by-month list view.
- **FR-038**: The system MUST display booking details when a calendar event is
  selected, showing the tenant name to staff and the nickname (or "Rezerwacja") to the
  public.
- **FR-039**: The system MUST provide contact, cookie-notice, 404 and server-error
  pages, and a privacy-policy link.
- **FR-040**: The system MUST remember the visitor's cookie-notice acknowledgement.
- **FR-041**: The system MUST allow a facility's employee list to receive a message
  from the Facilities tab.

**Data**

- **FR-042**: The system MUST migrate existing Firebase `bookings`, `clients`,
  `buildings` and `users` data, preserving identifiers and applying the documented
  defaults for missing fields.
- **FR-043**: The system MUST support paginated or filtered reads so that no endpoint
  returns the entire booking history by default.
- **FR-044**: The system MUST audit creation and modification of bookings with user
  identity and timestamp.

### 6.2 Non-Functional Requirements

- **NFR-001 (Security)**: No secrets in the client bundle. All credentials (database,
  JWT secret, mail service) come from server-side configuration. The committed
  `.env` values in `apps/server/.env` MUST be rotated and removed.
- **NFR-002 (Security)**: Authentication uses short-lived tokens; the legacy 15-minute
  inactivity auto-logout is explicitly **not** required (removed in legacy issue #70).
- **NFR-003 (Validation)**: Every write endpoint validates input and returns
  field-level error messages.
- **NFR-004 (Testing)**: Unit tests for conflict detection, cyclical expansion, report
  generation, permission checks and validation. Integration tests for every endpoint
  including authorisation. End-to-end tests for the P1 journeys.
- **NFR-005 (i18n)**: All user-facing copy is Polish; the code and API are English.
  Copy MUST be centralised so it can be translated later.
- **NFR-006 (Accessibility)**: Interactive controls reachable by keyboard, form errors
  announced, and colour is not the only signal for conflict state.
- **NFR-007 (Compatibility)**: Current evergreen browsers; the legacy
  `react-app-polyfill/ie11` requirement is dropped.
- **NFR-008 (Observability)**: Structured logs for authentication, booking changes and
  notification failures.
- **NFR-009 (Performance)**: Booking list and calendar load within 2 s for a typical
  year of data on a standard connection.
- **NFR-010 (Maintainability)**: A single source of truth for the API contract, shared
  types between UI and API, and no duplicated business rules.

### 6.3 Key Entities

- **User**: staff account. Identity, first/last name, e-mail, password hash, role flags
  (administrator, office, employee), assigned city, facilities, last login.
- **City**: one of the four municipalities. Identity, display name, ordering.
- **Facility (Building)**: belongs to a city. Name, property key, rentable sizes,
  lighting/toilets availability, contact e-mail, contact phone, assigned employees.
- **Client**: tenant. Type (individual/company), name, contact person, phone, e-mail,
  address, postal code, NIP.
- **Booking**: one request. Client type, city, facility, size, optional client link,
  nickname, tenant name, club, e-mail, phone, payment method, discount, acceptance
  state, archive state, message, creator/modifier audit fields, one or more time slots.
- **BookedTime**: one slot of a booking. Day, start hour, end hour, status, participant
  count, comments.
- **SelectedExtraOption**: optional add-on for a facility that supports it. Which
  options (lighting, sanitary facilities), from-hour, to-hour.

---

## 7. Success Criteria

- **SC-001**: 100 % of the capability matrix in section 3 is enforced by the API and
  verified by automated tests.
- **SC-002**: The conflict-detection rules produce identical results to the legacy
  implementation for a reference set of at least 50 booking pairs.
- **SC-003**: All legacy bookings, clients, facilities and users are migrated with zero
  data loss and zero broken references (verified by reconciliation counts).
- **SC-004**: A public visitor can complete a booking request in under 2 minutes on a
  mobile device.
- **SC-005**: An administrator can locate and approve a specific pending request in
  under 30 seconds.
- **SC-006**: A monthly per-client summary CSV is generated in under 3 seconds for a
  client with 200 bookings.
- **SC-007**: No credential, API key or mail-service identifier is present in the
  built client assets.
- **SC-008**: Automated test coverage is at least 80 % for the domain modules
  (bookings, conflicts, reports, authorisation).

---

## 8. Assumptions

- The four cities and their facilities listed in section 4 remain the operating scope.
- Staff accounts continue to be created by an administrator; there is no public
  registration.
- The existing Firebase data set is the migration source and remains read-only after
  cut-over.
- Payment is settled outside the application; the recorded payment method and discount
  are informational.
- E-mail remains the notification channel.
- The application is served in Polish only for the first release.
- Business hours for booking are 06:00–24:00 and the week starts on Monday (legacy
  calendar configuration).
- `[NEEDS CLARIFICATION]` items are listed in section 9 and must be resolved before
  the corresponding work is scheduled.

## 9. Open Questions

1. **[NEEDS CLARIFICATION]** Does the rewrite target the same four cities at launch, or
   should cities and facilities become fully administrator-managed from day one?
2. **[NEEDS CLARIFICATION]** Should the public be able to cancel their own request, or
   must every change go through staff?
3. **[NEEDS CLARIFICATION]** Is the `mkulakowski@umsiechnice.pl` restriction still
   required, and should it be a general configuration instead of a hardcoded account?
4. **[NEEDS CLARIFICATION]** Should rejected bookings be deleted or retained with a
   rejection status for audit?
5. **[NEEDS CLARIFICATION]** Is a notification required for the applicant when a
   request is approved or rejected?
6. **[NEEDS CLARIFICATION]** Which e-mail provider replaces EmailJS, and who owns the
   sending domain?
7. **[NEEDS CLARIFICATION]** What is the retention policy for archived bookings?
8. **[NEEDS CLARIFICATION]** Should the PDF report become a server-generated document
   instead of a browser print view?
9. **[NEEDS CLARIFICATION]** Is a self-service password reset needed for staff?
