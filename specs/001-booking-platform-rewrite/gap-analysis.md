# Gap Analysis — Legacy Application vs. Target Platform

This is the deliverable requested for the "find all functionality, endpoints, views, gaps"
part of the brief. It is the evidence base for the requirements in `spec.md`.

## 1. Inventory of the legacy application

### 1.1 Routes (`src/views/Root.tsx`, hash router)

| Route | Component | Access |
|-------|-----------|--------|
| `/` | `user-view/Main.tsx` | public; redirects to `/admin` if authenticated |
| `/login` | `admin-view/Login.tsx` | public; redirects to `/admin` if authenticated |
| `/admin` | `admin-view/Admin.tsx` | staff; redirects to `/login` if not authenticated |
| `/contact` | `user-view/Contact.tsx` | public |
| `/server-error` | `user-view/ServerError.tsx` | public |
| `*` | `user-view/NoMatch.tsx` | public |

### 1.2 Views and tabs

| View | Tabs / sections | Component |
|------|-----------------|-----------|
| Public calendar | city selector, facility selector, calendar, booking details, request button | `Main`, `SideNav`, `Calender`, `BookingDetails` |
| Admin calendar | same plus status resolution | `Admin`, `Calender`, `ModalResolveBooking` |
| Bookings | period loader, search, unapproved filter, expandable rows, conflict counter | `Bookings` |
| Clients | search, add, edit, delete | `Clients` |
| Facilities | facility details, employee list, message to employee | `Building` |
| Summary | client selector, month range, from-the-beginning, CSV, PDF | `Summary` |
| Contact | three information columns | `Contact` |
| Login | e-mail, password | `Login` |
| 404 / server error | informational | `NoMatch`, `ServerError` |

### 1.3 Feature inventory

| # | Feature | Legacy implementation | Target requirement |
|---|---------|----------------------|--------------------|
| F1 | Public calendar of accepted bookings | `Calender.tsx`, `getBookingDataForUser` | FR-037, FR-038 |
| F2 | Booking request by the public | `ModalBooking` → `BookingForm` | FR-011 |
| F3 | Multi-slot bookings | `BookingTimeForm`, `bookingTimeCreator` | FR-012 |
| F4 | Cyclical weekly bookings | `bookingTimeCreator` | FR-013 |
| F5 | Extra options for the artificial pitch | `BookingExtraOptions` | FR-011, data model |
| F6 | Conflict detection | `check-booking-conflicts-function.ts` | FR-015 |
| F7 | Approve / unapprove | `BookingForm` accepted checkbox | FR-017 |
| F8 | Resolve a slot (status, participants, comments) | `BookingTimeStatusForm`, `ModalResolveBooking` | FR-014, FR-018 |
| F9 | Reschedule a single slot | `BookingSingleTimeForm`, `ModalSingleBookingTime` | FR-017, FR-018 |
| F10 | Archive a booking | `BookingForm` archive checkbox | FR-017 |
| F11 | Load bookings for a period | `ModalLoadBookings`, `getBookingsDataByDate` | FR-020 |
| F12 | Search and filter bookings | `SearchInputField`, `filterBookingsPerPlace` | FR-021 |
| F13 | Pagination | `MultipleRecords`, `Pagination` | FR-022 |
| F14 | Client CRUD and search | `Clients`, `ClientForm` | FR-024, FR-025 |
| F15 | Auto-fill booking from a client | `fillUpFormWithClientData` | FR-019 |
| F16 | Facility details and employee list | `Building.tsx` | FR-009, FR-041 |
| F17 | Message to a facility employee | `Building.tsx`, EmailJS | FR-034, FR-041 |
| F18 | Contact form | `FormMessage` | FR-034 |
| F19 | Per-client summary | `summary-functions.ts` | FR-027 |
| F20 | CSV export (single and all clients) | `react-csv`, `csv-file-headers.ts` | FR-028, FR-029 |
| F21 | PDF report | `PreviewPDF.tsx` (window.print) | FR-030 |
| F22 | E-mail notification on booking change | `email-services.ts` (EmailJS) | FR-032, FR-033, FR-035, FR-036 |
| F23 | Login / logout | `Login.tsx`, `authAction.ts` | FR-001 |
| F24 | Role-based tab and action visibility | `credentials-function.ts` | FR-004, FR-005 |
| F25 | Cookie notice | `Cookies.tsx` | FR-040 |
| F26 | Privacy and contact links | `Footer`, `Contact` | FR-039 |
| F27 | Audit fields on bookings | `createBookingTimeStamps` | FR-016, FR-044 |
| F28 | Auto-logout after inactivity | commented out in `Admin.tsx` | **not required** (NFR-002) |
| F29 | Occupied area as a percentage | `transformToPercentage` | FR-031 |
| F30 | Building/employee message modal | `ModalMessage` | FR-034 |

### 1.4 "Endpoints" in the legacy application

The legacy application has no HTTP API of its own — it calls Firebase directly. The effective
data operations are:

| Operation | Firestore call | Location |
|-----------|----------------|----------|
| Sign in / sign out | `signInWithEmailAndPassword`, `signOut` | `authAction.ts` |
| Read buildings | `getDocs(collection('buildings'))` | `buildingActions.ts` |
| Read current user | `getDoc(doc('users', uid))` | `usersActions.ts` |
| Read all bookings | `getDocs(query('bookings', where('archive','==',false)))` | `bookingsAction.ts` |
| Read bookings by period | `query('bookings', orderBy('createdAt'), startAt, endAt)` | `bookingsAction.ts` |
| Read accepted bookings (public) | `query('bookings', and(where('accepted','==',true), where('archive','==',false)))` | `bookingsAction.ts` |
| Create booking | `addDoc(collection('bookings'), data)` | `bookingsAction.ts` |
| Update booking | `updateDoc(doc('bookings', id), data)` | `bookingsAction.ts` |
| Delete booking | `deleteDoc(doc('bookings', id))` | `bookingsAction.ts` |
| Read clients | `getDocs(collection('clients'))` | `clientsActions.ts` |
| Create / update / delete client | `addDoc` / `updateDoc` / `deleteDoc` on `clients` | `clientsActions.ts` |
| Send booking e-mail | `emailjs.send(...)` | `email-services.ts` |
| Send contact / employee e-mail | `emailjs.send(...)` | `email-services.ts` |

The target REST API in `contracts/openapi.yaml` replaces all of these.

---

## 2. Gap analysis

### 2.1 Architecture

| Gap | Impact | Target |
|-----|--------|--------|
| All business logic in the browser | Rules can be bypassed; no server authority | NestJS API owns all rules |
| Direct database access from the client | Firestore rules allow any authenticated user full access to all collections | API-mediated access with per-role authorisation |
| Two Firebase project configs compiled into the bundle | Credential exposure | Server-side configuration only |
| EmailJS identifiers compiled into the bundle | Credential exposure and no audit trail | Server-side notification module |
| No shared types between data layer and UI | Silent drift, `any` in transformation code | `libs/models` shared by UI and API |
| Firestore document shape differs from the API schema | Migration risk | Documented transformation (research.md R10) |

### 2.2 Functional gaps

| Gap | Evidence | Target requirement |
|-----|----------|--------------------|
| Public callers can read personal data in the API sense — the client merely hides it | `parseFirebaseBookingData` returns `person`, `email`, `phone`, `message` for every caller | FR-005, authorization matrix note 6 |
| Users endpoints over-permissive | every route uses `AuthGuard('jwt')` only | authorization matrix note 1 |
| Client and facility delete routes never match | `@Delete('_id')` | authorization matrix note 3 |
| Password hashing bypassed on update | `pre('save')` hook only; `updateUser` uses `updateOne` | data model, users |
| `recheckPassword` never compared | `UserDto` field unused | data model, users |
| `paymentMethod` enum drops `free` | legacy `PAYMENTS_OPTIONS` includes `free`; new enum has `CARD` | data model note |
| No server-side conflict check on approval | conflict detection is client-only | FR-015 |
| No applicant notification on approval/rejection | only creation/update notifies | open question 5 |
| No audit trail for approval decisions | only create/modify timestamps | open question 4 |
| No password reset | not implemented anywhere | open question 9 |
| Summary invisible for bookings without `clientId` | `findAllClientReservation` filters on `clientId` | research.md R11 |
| Summary tab cannot be disabled by configuration | hardcoded e-mail in `summaryUserRestriction` | FR-006, open question 3 |
| PDF depends on the deployed production URL | `window.open('https://sisk-booking-app.web.app/...')` | research.md R7 |
| No error boundary | a render error blanks the app | FR-039, research.md R11 |

### 2.3 Quality gaps

| Gap | Evidence | Target |
|-----|----------|--------|
| No tests | no `*.test.*`/`*.spec.*` files; `setupTests.js` unused | NFR-004, SC-008 |
| No CI | no `.github/workflows` in either repository | NFR-004 |
| No server-side validation | all validation lives in `react-hook-form` rules | NFR-003 |
| No API contract | none exists | `contracts/openapi.yaml` |
| No pagination on the server | full collection downloaded on every load | FR-022, FR-043 |
| Inconsistent date handling | five overlapping helpers; manual DST offset | research.md R4 |
| Duplicated building and client option generation | two implementations each | research.md R11 |
| Dead code and unreachable modal types | `MODAL_TYPES.PDF`, `AUTO_LOGOUT` | research.md R11 |
| Prop mutation | `fillUpFormWithClientData` mutates `bookingsList` | research.md R11 |
| Accessibility | clickable icons in table cells, no keyboard or ARIA support | NFR-006 |
| Unused build polyfills | `react-app-polyfill/ie11` | NFR-007 |
| Legacy dependency set | React 18 + CRA 5, superseded by the Nx workspace | research.md R1 |

### 2.4 Data gaps

| Gap | Evidence | Target |
|-----|----------|--------|
| Records missing newer fields | `api-functions.ts` supplies defaults for `nick`, `discount`, `createdBy`, `modifiedBy`, `participants` | migration defaults |
| `payment: 'invoice'` needs mapping | `changePaymentMethod` | migration mapping |
| Field renames between legacy and target | `bookingTime`→`bookedTimes`, `person`→`personName`, `message`→`comments` | migration mapping |
| Legacy `building[]` on users | `IUser.building: string[]` | `users.buildings` |
| Legacy boolean role flags | `isAdmin`/`isEmployee`/`isOffice` | `users.role` |
| No indexes | no `index()` calls in any schema | data model indexes |
| `QUIT` vs `CANCELED` | legacy status enum | data model mapping |

### 2.5 State of the rewrite repository (`MIBuczek/book-space`)

| Area | Present | Missing |
|------|---------|---------|
| Nx workspace, path aliases, docker-compose | ✅ | — |
| NestJS bootstrap, global `/api` prefix, CORS, cookie parser | ✅ | global validation pipe, error filter, logging |
| JWT authentication | ✅ | role guards, `/auth/me` |
| Mongoose schemas: users, clients, buildings, bookings, booked times | ✅ | role/assignment fields, facility identity fields, indexes, audit fields |
| DTO validation | ✅ | NIP conditional rule, enum reconciliation, `recheckPassword` |
| Bookings endpoints | ✅ CRUD + booked-times update | approve/archive, conflict query, period filtering, pagination, ownership rules |
| Clients / buildings endpoints | ✅ CRUD | fixed delete routes, authorisation |
| Users endpoints | ✅ CRUD | administrator-only authorisation, password handling |
| Notification module | shell only | provider integration, templates, error handling |
| Reporting module | ❌ | summary, CSV, PDF data |
| Angular UI | Nx starter shell only | the entire feature UI |
| Tests | generated stubs | real unit, integration and end-to-end tests |
| CI | ❌ | pipeline |
| Migration tooling | ❌ | importer plus reconciliation |
