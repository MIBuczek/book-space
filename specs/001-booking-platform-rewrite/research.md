# Phase 0 Research — Book Space rewrite

Decisions taken while turning the legacy application into a specified rewrite. Each entry
records what exists today, what the target is, and why the alternatives were rejected.

---

## R1 — Target stack

**Decision**: keep the Nx monorepo with NestJS 9 + Mongoose 7 for the API and Angular 16 for
the UI.

**Context**: `MIBuczek/book-space` already contains a working NestJS application (JWT auth,
Mongoose schemas, DTO validation) and an Angular 16 standalone-bootstrap application. The
commit "Create services endpoints" (#1) delivered the API skeleton.

**Alternatives rejected**:
- *Keep React and add a server* — the existing rewrite repository is already an Angular/Nx
  workspace and the maintainer chose it; reverting would discard working code.
- *Serverless functions* — the conflict and reporting logic needs a persistent connection and
  scheduled/transactional behaviour that is simpler in a long-running process.

**Consequence**: the UI must be built from scratch in Angular; the legacy React components are
a behavioural reference, not a source to port line by line.

---

## R2 — Authentication

**Decision**: e-mail + password, `bcrypt` hash comparison, JWT bearer token signed with a
server-side secret, 1-day expiry, sent in the `Authorization` header. Keep the existing
`POST /api/auth/sign-in` and `GET /api/auth/sign-out` shape, but make sign-out stateless and
client-driven rather than relying on a cookie that the API never issues on sign-in.

**Context**: `AuthorizationService.signIn` compares with `bcrypt.compare`, updates `lastLogin`
and returns the user; the controller signs `{email, _id}`. The `signOut` endpoint clears a
`jwt` cookie, but `signIn` never sets one, so the cookie path is dead code. The JWT strategy
extracts the token from the `Authorization` header only.

**Alternatives rejected**:
- *httpOnly cookie session* — would require CSRF protection and CORS credential handling; the
  header-based bearer token already works with the existing strategy.
- *Firebase Auth* — the whole point of the rewrite is to remove the Firebase dependency.

**Consequence**: the UI stores the token in memory (and optionally session storage), attaches
it through an HTTP interceptor, and treats a 401 as "session expired".

---

## R3 — Secrets

**Decision**: `apps/server/.env` MUST NOT be committed. Database URI and JWT secret move to
environment variables injected at deploy time; the committed values are rotated and removed.

**Context**: `apps/server/.env` currently contains a live MongoDB Atlas connection string with
credentials (`mongodb+srv://…:…@book-space.gdwdhbl.mongodb.net/`) and `JWT_SECRET`. The legacy
React application additionally embeds two Firebase configs and EmailJS service/template/user
ids in `firebase-const.ts` and `email-service-data.ts`.

**Consequence**: the first security task is rotation plus removal, and CI must fail if a
`.env` file or a known key pattern is committed.

---

## R4 — Time-zone handling

**Decision**: store and compare instants in UTC; render in `Europe/Warsaw`; derive "day" from
the facility-local date. **The day rule**: a slot's calendar day is its `Europe/Warsaw` date,
so a slot whose instant falls on a different UTC date still belongs to the Warsaw day the
facility sees; "same day" (conflict detection, T018) and a day's bounds (`startOfFacilityDay`)
are both computed from that date, never from the UTC date.

**Context**: the legacy code manually adds one or two hours depending on daylight saving
(`checkIfWinterTimeZone`, `formatDisplayTime`) and builds day/hour strings by concatenation
(`overwriteDate`). This produced several defects, including legacy issues #27 and #58
("Wrong format of hours on booking form", "Issue with booking time value").

**Alternatives rejected**:
- *Port the manual offset logic* — it is the source of the bugs being fixed.
- *Store local time strings* — breaks range queries and sorting.
- *Add a date library (`luxon`, `date-fns-tz`, `moment-timezone`)* — the conversion is three
  `Intl` calls, Node 24 ships full ICU, and the UI needs the same code. A dependency would
  have to be shared by two applications and would still be pinned to the same zone database.

**Consequence**: all date handling goes through one shared module with unit tests covering
both DST transitions.

**Landed (T019, moved and completed by T055).** The module is
`libs/date-time/src/lib/facility-time.ts`, published as `@booking/date-time`, so the API and
the UI import the same code rather than each deriving an offset — the drift R4 exists to
prevent is otherwise unobservable until the two disagree on a DST day. It uses
`Intl.DateTimeFormat` with `timeZone: 'Europe/Warsaw'` and `hourCycle: 'h23'` rather than a
date dependency. `hourCycle: 'h23'` matters: the default cycle reports local midnight as hour
`24`, which shifts every day boundary. `facility-time.spec.ts` pins both transitions — local
midnight is `23:00Z` the day before spring-forward and `22:00Z` the day before fall-back — and
`addFacilityDays` is asserted to preserve the wall-clock hour across both, so a "constant UTC
offset" rewrite fails. The cyclical expansion (`bookings/cyclical/cyclical.ts`), the reporting
ranges (`reporting/summary/range.ts`), the academic-year periods
(`bookings/list/academic-year.ts`) and the CSV/notification formatters
(`reporting/csv/display.ts`) are all built on it.

**Migration reinterpretation (T055).** The legacy application stored slot times as local
wall-clock values — `overwriteDate` concatenated a local date and time and parsed the result
in the viewer's browser zone — while `day` was anchored at `T00:01:00.000Z`. Neither is a true
instant. `instantFromLegacyLocal` reinterprets a legacy value as a Europe/Warsaw wall clock, so
the migration (T041/T042) must use it rather than `new Date(value)`: parsing the same string as
UTC would move every slot by one or two hours, by a different amount either side of a DST
transition. A value inside the spring-forward gap maps forward; a value in the autumn repeated
hour resolves to the later occurrence, which is what `atFacilityTime` does for the same wall
clock.

---

## R5 — Conflict detection

**Decision**: reimplement the existing algorithm on the server with the same semantics, and
cover it with tests that compare against the legacy implementation.

**Context**: `check-booking-conflicts-function.ts` defines the rules. Two slots conflict when
they are on the same day and their hour ranges overlap, where overlap is any of:
one range's start or end strictly inside the other, or one range fully containing the other.
A booking only participates in conflict checks when it is not accepted
(`checkConflicts` returns early for accepted bookings) and when the month matches.
`checkAllBookingsConflicts` returns the distinct ids of unaccepted conflicting bookings.

**Alternatives rejected**:
- *Interval-tree or database-level range queries* — unnecessary at the current data volume and
  harder to prove equivalent to the legacy behaviour.

**Consequence**: the server owns a pure, tested function; the UI only displays the result.

**Landed (T018).** `apps/server/src/app/bookings/conflicts/conflicts.ts` holds the rules as
`findConflictingBookingIds` (plus `slotsConflict`), free of Nest and Mongoose. The overlap test
is strict-inside-or-contains, so a touching interval (`end === start`) is not a conflict;
`day` is compared as an instant, matching the legacy `checkDay`; an accepted booking is excluded
as a *reported* id but still participates as a comparison target, which is what the legacy
`checkConflicts` did. The server query is scoped to one facility-month
(`GET /bookings/conflicts`, administrator-only) and the comparison runs over that set. SC-002 is
met by `conflicts.spec.ts`, which carries an independent transcription of the legacy algorithm
and asserts agreement over 200 generated sets (~900 booking pairs), not by calling the new code
from both sides. Approval-with-`force` (T020) is where the result is enforced before a write.

**Corrected (T054, #121).** The legacy gate `currentBooking.month === b.month` was reproduced
faithfully by T018 and is now removed. `month` is derived from the booking's **first** slot, so
a booking whose slots straddle a month boundary carried one scalar and its cross-boundary slot
was never compared against bookings in the month it crossed into — a missed conflict, not a
spurious one. The rule keys on `bookedTimes.day` (two slots only conflict when they share a
day, which subsumes the month gate everywhere it was correct), and the stored `month` is a
denormalised hint nothing reads. The counter (`GET /bookings/conflicts`) and the approval check
scope by the slot days: a day range and the target's own `$in` day set respectively. SC-002
still holds over the domain the legacy gate got right — the oracle is fed the same
first-slot-derived month — and the boundary cases the gate got wrong are pinned by named unit
and HTTP tests that assert the legacy transcription misses them. The facility-month index is
replaced by `{city, place, bookedTimes.day}`.

**Landed (T020).** `POST /bookings/{_id}/approve` enforces the rule at approval time. The
question it asks is narrower than the facility-month counter: only the bookings that overlap
*this* one matter, and an already-accepted booking is a conflict rather than an excluded
candidate — so `findConflictsWith(target, others)` is a second function, not a flag on
`findConflictingBookingIds`. An approval that would keep a conflict is refused with `409`
carrying the conflicting ids, unless `force` is set; a forced approval still reports them on
the `200`. Unapproving runs no check, because it cannot introduce a double booking. The
`409` body needs a field the global filter's `{statusCode, message, error}` envelope cannot
hold, so `StructuredHttpException` carries its body whole and the filter honours it below
500 only. `POST /bookings/{_id}/archive` is the companion visibility change, and both routes
record `modifiedBy`/`modifiedAt` with the write (FR-016).

**Landed (T021).** `PUT /bookings/{_id}/booked-times` is the slot-replacement route, and the
resolved-slot rule (FR-018) now lives there. The route path was `booked_times` while the
contract said `booked-times`; it now matches the contract, and the route gained the ownership
check the other write routes carry. The rule itself is
`apps/server/src/app/bookings/slots/resolved-slots.ts` — a pure function over the stored list
and the incoming list, so it has its own spec rather than being reachable only through a
request. A slot is identified by `day`, matching the legacy `concatBookingTime`, which merged
slot lists on `day`; a stored slot whose status is not `INITIAL` must appear in the body
unchanged, or the request is refused with `409` (removal and edit get distinct messages, the
removal one verbatim from `BookingTimeForm.deleteBookingTime`). Reverting a resolved slot to
`INITIAL` is an edit and is refused with no override: FR-018 names no exception, and an
"unresolve" flag would be a capability neither the spec nor the legacy app describes. The
body is a top-level array, which the global `ValidationPipe` does not check (it declines an
`Array` metatype), so the route attaches `ParseArrayPipe` with the same options — `whitelist`,
`forbidNonWhitelisted`, 422 — which is also why `BookedTimeDto.participants`/`comments`
became optional: they always were in the contract and the data model, and nothing validated
the array before. `BookingService.updateBooking` strips `bookedTimes` for the same reason it
strips `accepted`/`archive`: the field has its own route with its own rule, and leaving it
settable on the generic update would be the rule absent on one of the two paths that write
it. T023 builds the *creation* path on top of this route; the replacement semantics are
already here.

---

## R6 — Facilities and cities as data

**Decision**: seed the four cities and twelve facilities from the legacy constants into
MongoDB, and serve them from `GET /api/buildings`. Extend the schema with `city`, `property`,
`sizes`, `lighting`, `toilets`, and employee references.

**Context**: the legacy UI reads `building-data-const.ts` as a compiled-in constant *and* reads
a `buildings` collection from Firebase. `generate-building-function.ts` prefers the database
and falls back to the constant. The Buildings tab shows employee lists from the constant.

**Consequence**: one source of truth; the fallback constant disappears. `employees` stores
display names rather than user references (T009): the legacy constant holds names, and staff
user management (T051) does not exist yet, so a reference would resolve to nothing and the
Facilities tab (FR-009) would be empty. The field type is unchanged, so adopting references
later is a data migration, not a contract change.

**Landing (T012)**: the seed is `apps/server/src/app/buildings/seed/facility-seed.ts`
(the twelve facilities) plus `ReferenceDataService`, which upserts each facility on the
`{city, property}` key. The upsert is what makes it idempotent *and* able to complete a
partially seeded database; an "insert if empty" guard would skip a database an administrator
had already touched. The constant is authoritative, so the bootstrap hook that runs it is
gated on `SEED_REFERENCE_DATA=true` and is otherwise off, so a production database is only
seeded deliberately.

Two discrepancies the legacy data forced into the open:

- **Twelve facilities, not thirteen.** `spec.md` §1's introduction says "13 rentable sport
  facilities" while §4's per-city tables and the legacy constant both list twelve. Twelve is
  what the seed writes; the intro's count is the outlier.
- **No facility address.** `spec.md` §4, FR-009 and the legacy `building-data-const.ts` carry
  no `street`/`zipCode`; the only municipal address in the legacy repository is SISK's own
  office in the footer, which is not a facility. The schema and contract had both fields
  `required`, so the seed would have had to invent twelve addresses. They are now optional
  (schema, DTO, contract, `data-model.md`), and the seed supplies neither. FR-009 enumerates
  facility contact details as e-mail, phone, lighting and toilets, so an address was never a
  requirement — the `required` flag was a copy of the client schema, down to its error text
  ("Please add client street").

---

## R7 — Reporting and export

**Decision**: the API computes the summary and the CSV rows; the UI requests a range and
renders or downloads the result. PDF is produced from a printable view for the first release.

**Context**: `summary-functions.ts` and `PreviewPDF.tsx` build the report entirely in the
browser. `PreviewPDF` opens a hardcoded production URL (`sisk-booking-app.web.app`) and writes
HTML into the new window — it cannot work offline and depends on the deployed site.

**Alternatives rejected**:
- *Keep client-side report generation* — it requires the full booking history in the browser,
  contradicting FR-043 (no unbounded reads), and duplicates aggregation logic.
- *Server-side PDF rendering library* — deferred; the print view is adequate for v1 and avoids
  a heavy dependency (see open question 8 in the spec).

**Consequence**: the CSV column set from `csv-file-headers.ts` becomes a documented contract
so the file remains compatible with existing downstream spreadsheets.

---

## R8 — Notifications

**Decision**: the API sends e-mail through a provider configured server-side. The empty
`NotificationModule` becomes the implementation point.

**Context**: the legacy UI calls EmailJS directly with service, template and user identifiers
compiled into the bundle. Notification failure currently shows an error modal but does not
undo the booking.

**Alternatives rejected**:
- *Keep EmailJS from the browser* — exposes credentials and cannot be audited.
- *A full queue with retries* — deferred; a direct send with error surfacing matches current
  behaviour, and FR-036 preserves the "booking is not lost" property.

**Abuse protection (T057, FR-048–FR-051)**. The module's two routes are the only ones an
unauthenticated caller can drive, so the controls live here as well as on `POST /bookings`:

- **Request rate limit** — a fixed-window counter keyed on the client address *and* the
  submitted sender address, answering `429` with a `retryAfterSeconds` hint. The window is
  process-local (`security/rate-limit/`), which is correct for the single-replica municipal
  deployment this project targets; behind more than one replica the effective limit is
  multiplied, and the store is a class behind a `record()` seam so a shared backend can
  replace it without touching the guard.
- **Bot mitigation** — a hidden decoy field, not a CAPTCHA. A CAPTCHA would conflict with
  NFR-006 and introduce a third-party dependency for a low-value municipal form; the decoy is
  accessibility-neutral and a false positive is a retryable `422`, not an unsolvable wall.
- **Outbound quota** — a per-recipient cap checked before the transport is called, so the
  contact route cannot be driven as a relay. Counting the *recipient* rather than the caller is
  what makes it a different control from the request limit: a script behind rotating IPs still
  spends the recipient's allowance.
- **Recipient allow-list** — the fix for #124. `MessageDto.recipient` used to be sent to
  directly, so the public route would deliver the SISK-branded `employee-message` template to
  any syntactically valid address. It is now honoured only for an authenticated staff caller
  *and* only when it matches a facility's stored contact address; a public caller that names one
  gets `403`, a staff caller whose address matches no facility gets `422`.

The limit is read from `PUBLIC_RATE_LIMIT` / `NOTIFICATION_QUOTA` (and their `_WINDOW_MS`
counterparts); `0` disables the check. The client address comes from Express's own resolution
so the operator opts into `X-Forwarded-For` through `trust proxy` rather than a caller picking
their own key.

---

## R9 — Booking list loading and pagination

**Decision**: the API supports date-range filtering and pagination. The UI keeps the legacy
"load a period" concept but as a query parameter rather than an all-or-nothing client fetch.

**Context**: the legacy app loads every booking on start-up, then offers a modal
(`ModalLoadBookings`) to reload by academic year (`generateBookingDateOptions`, years from
2022, each 1 August → 31 August). Issue #74 and #76 introduced the period selector and a
record limit.

**Consequence**: the default view loads the current academic year, with an explicit "all
records" option for administrators.

**Landed (T022).** `apps/server/src/app/bookings/list/` holds the rule:
`academic-year.ts` derives the current period (August turn-over, facility-local midnights)
and `booking-list.ts` resolves the request into a filter and a page, as pure functions with
their own specs. `GET /api/bookings` takes `from`, `to`, `city`, `building`, `accepted`,
`archive` (default `false`), `clientId`, `page`, `limit` (default 50, max 200) and `all`,
and answers the contract's `{items, total, page, limit}` envelope; `total` is a
`countDocuments` on the same filter, so it is the pre-pagination count.

Two decisions the pure module fixes:

- **The period filters `createdAt`, not the slot date.** The legacy `getBookingsDataByDate`
  was `orderBy('createdAt'), startAt, endAt`, and `data-model.md` indexes `{createdAt: -1}`
  for this read. `createdAt` was not on the booking schema; T022 adds it (immutable,
  defaulted) so the range has a field to range over. A booking's creation time is not its
  ObjectId timestamp once migrated, so a real field is what the migration can supply.
- **An anonymous caller must name a period.** The public calendar is the one path an
  unauthenticated caller reaches, so an unbounded read there is the exposure the issue
  names; a missing bound is `422`. Staff default to the academic year, which is a
  performance measure, not a boundary — they may read the history and `all=true`
  (administrator-only) is how they ask.

The `archive`/`accepted` flags are read with a `@BooleanQuery` transform, not a bare
`@IsBoolean`. The global pipe's `enableImplicitConversion` coerces a query string with
`Boolean(value)`, and `Boolean('false')` is `true`, so `?archive=false` would have asked
for the archived records — a filter that inverts without an error. The transform reads the
raw query value (`obj[key]`), which is still the string at that point. `booking-query.dto.spec.ts`
runs the real pipe and pins `?archive=false`.

---

## R10 — Migration

**Decision**: a one-off, repeatable, testable tool reads the legacy Firebase collections and
writes MongoDB documents, applying documented transformations.

**Transformations required**:
- `bookings.bookingTime[]` → `bookings.bookedTimes[]`; field renames: `startHour`→`startHours`,
  `endHour`→`endHours`, `person`→`personName`, `club`→`personCompany`, `email`→`personEmail`,
  `phone`→`personPhone`, `message`→`comments`, `payment`→`paymentMethod`, `type`→uppercased
  `INDIVIDUAL`/`COMPANY`.
- `payment: 'invoice'` → `transfer` (legacy read-time mapping in `api-functions.ts`).
- `city` + `building` → a `place` object; `property` keys normalised (note `kort_1`/`kort_2`
  use underscores while other keys use hyphens).
- Missing `createdBy`/`createdAt`/`modifiedBy`/`modifiedAt`/`nick`/`discount`/`participants`
  get the defaults documented in the spec's edge cases.
- Every legacy local-time value (`bookingTime[].day`/`startHour`/`endHour`, and any other date
  field) is a Europe/Warsaw wall clock, not a UTC instant; the transform reinterprets it through
  `instantFromLegacyLocal` (`@booking/date-time`) rather than `new Date(value)` (R4, T055).
- `clients` and `buildings` map field-for-field, with `buildings.size` becoming `sizes`.
- `users` are recreated with hashed passwords; `isAdmin`/`isEmployee`/`isOffice`/`city`/
  `building` map onto the target role and assignment model.

**Consequence**: reconciliation counts per collection are a release gate (SC-003).

---

## R11 — Reporting of the current gaps

The legacy application contains features that are declared but not wired, and behaviour that
is duplicated or contradictory. These are recorded so the rewrite does not reproduce them.

**Dead or unreachable code**:
- `MODAL_TYPES.PDF` is declared and `PreviewPDF` is imported by `Summary`, but no modal ever
  renders for it — the PDF is a `window.open` side effect.
- `MODAL_TYPES.BOOKING_SINGLE_TIME` and `BOOKINGS_STATUS` are handled in `Bookings.tsx`, while
  `BOOKING_CONFLICTS` is handled there too but raised from `RecordOpenItem` in the Clients and
  Bookings trees; the modal-type coupling spans unrelated components.
- `ModalBooking` is a thin wrapper that always passes `isAdmin={false}`, so the public request
  form and the staff form share one component with six boolean props.
- `userMouseClick` hook and the auto-logout interval are commented out in `Admin.tsx`; the
  `ModalOutLogOut` component is still rendered for `MODAL_TYPES.AUTO_LOGOUT`, which can no
  longer be opened (legacy issue #70 removed auto-logout).
- `modalStore` is included in `IReduxState` but the reducer is named `modal` in `rootReducer`
  while the selector reads `state.modal` — consistent, but the naming is inconsistent with the
  other slices.
- `checkSingleDayConflict` is only reachable through `RecordOpenItem`, so conflict detail is
  only visible inside an expanded table row.

**Duplicated logic**:
- Building options are generated in `options-const.ts` (from constants) and in
  `generate-building-function.ts` (from data). `SideNav` and `BookingForm` each call a
  different one.
- Client options are generated in `utils-functions.ts` (`selectClientOptions`) and again in
  `Summary.tsx` (`generateClientsOptions`).
- Date formatting exists in `calender-functions.ts` (`formatDate`, `formatTime`,
  `formatCalenderDate`, `formatCalenderHours`, `formatDisplayTime`) with overlapping purpose.
- The occupied-size percentage conversion appears in `modeling-value-function.ts`
  (`transformToPercentage`) and is needed again in `PreviewPDF`.

**Missing capabilities**:
- No automated tests of any kind (`src/setupTests.js` imports `@testing-library/jest-dom` but
  there is not a single test file).
- No API contract or shared types between client and server — the client talks to Firebase
  directly.
- No server-side validation, so every rule in `Login.tsx`, `BookingForm.tsx` and
  `ClientForm.tsx` is bypassable.
- No pagination on the server; the entire booking collection is downloaded.
- No error boundary; a render error blanks the application.
- No CI configuration.
- Accessibility: tables are built from `div`/`span` with clickable icons and no keyboard
  support or labels; form errors are visual only.

**Inconsistencies to resolve during the rewrite**:
- `BOOKING_STATUS.QUIT` renders as "Rezygnacja" (`transformValue`) while
  `BOOKING_STATUS_OPTIONS` labels the same value "Odwołana"; the target model uses
  `CANCELED` and one label. **Resolved (issue #55, CHK014):** the target adopts the
  `transformValue` wording for all three statuses (`INITIAL` "Nie rozpoczęta", `DONE`
  "Zakończona", `CANCELED` "Rezygnacja"), used by the UI, the CSV and the printable report
  alike; `data-model.md` § "Slot status vocabulary" records the decision and a spec pins the
  UI and report maps together.
- The status enum in the new API is `INITIAL | DONE | CANCELED`; the legacy values are
  `INITIAL | DONE | QUIT`.
- `RECORDS_BOOKINGS_ROW` includes `accepted` in the row, so the boolean renders through
  `modelDisplayValue` as "Tak"/"Nie" next to a separate conflict icon.
- `summary-functions.ts` filters with `b.accepted` when building reports, but
  `findAllClientReservation` also filters on `clientId`; a booking without a linked client is
  invisible in reports.
- `BookingForm` mutates the `bookingsList` prop directly in `fillUpFormWithClientData`.
