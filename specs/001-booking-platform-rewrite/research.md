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
the facility-local date.

**Context**: the legacy code manually adds one or two hours depending on daylight saving
(`checkIfWinterTimeZone`, `formatDisplayTime`) and builds day/hour strings by concatenation
(`overwriteDate`). This produced several defects, including legacy issues #27 and #58
("Wrong format of hours on booking form", "Issue with booking time value").

**Alternatives rejected**:
- *Port the manual offset logic* — it is the source of the bugs being fixed.
- *Store local time strings* — breaks range queries and sorting.

**Consequence**: all date handling goes through one shared utility with unit tests covering
both DST transitions.

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

---

## R6 — Facilities and cities as data

**Decision**: seed the four cities and twelve facilities from the legacy constants into
MongoDB, and serve them from `GET /api/buildings`. Extend the schema with `city`, `property`,
`sizes`, `lighting`, `toilets`, and employee references.

**Context**: the legacy UI reads `building-data-const.ts` as a compiled-in constant *and* reads
a `buildings` collection from Firebase. `generate-building-function.ts` prefers the database
and falls back to the constant. The Buildings tab shows employee lists from the constant.

**Consequence**: one source of truth; the fallback constant disappears.

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
  `CANCELED` and one label.
- The status enum in the new API is `INITIAL | DONE | CANCELED`; the legacy values are
  `INITIAL | DONE | QUIT`.
- `RECORDS_BOOKINGS_ROW` includes `accepted` in the row, so the boolean renders through
  `modelDisplayValue` as "Tak"/"Nie" next to a separate conflict icon.
- `summary-functions.ts` filters with `b.accepted` when building reports, but
  `findAllClientReservation` also filters on `clientId`; a booking without a linked client is
  invisible in reports.
- `BookingForm` mutates the `bookingsList` prop directly in `fillUpFormWithClientData`.
