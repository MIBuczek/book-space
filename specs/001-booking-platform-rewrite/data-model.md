# Phase 1 Data Model — Book Space

Target MongoDB database: `book_space`. Mongoose schemas live next to their feature module in
`apps/server/src/app/<feature>/schemas/`. Shared TypeScript types live in `libs/models`.

Legend: **[exists]** = already implemented in `MIBuczek/book-space`; **[change]** = exists but
must be modified; **[new]** = must be created.

---

## users — [change]

Current schema: `apps/server/src/app/users/schemas/user.schema.ts`
Current type: `libs/models/user.model.ts`

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | |
| `email` | string | required, unique, lower-case, valid e-mail |
| `password` | string | required, min 6, max 30, `bcrypt` hash, never returned |
| `firstName` | string | required, min 3 |
| `lastName` | string | required, min 3 |
| `role` | enum `ADMIN` \| `OFFICE` \| `EMPLOYEE` | **[new]** required |
| `city` | string | **[new]** assigned city; required for non-admin |
| `buildings` | string[] | **[new]** assigned facility property keys |
| `active` | boolean | **[new]** default `true`; deactivated users cannot sign in |
| `createdAt` | Date | immutable, default now |
| `lastLogin` | Date | updated on sign-in |

**Migration from legacy `users`**: legacy documents carry boolean flags `isAdmin`,
`isEmployee`, `isOffice` plus `city` and `building[]`. Mapping:
`isAdmin → role: ADMIN`, else `isOffice → role: OFFICE`, else `isEmployee → role: EMPLOYEE`.
Legacy `building[]` maps to `buildings[]`.

**Changes needed**:
- Add `role`, `city`, `buildings`, `active`.
- The `pre('save')` hook must not re-hash an already-hashed password when the document is
  updated through `updateOne` (the hook only fires on `save`, so `updateUser` currently
  bypasses hashing entirely — a defect to fix).
- Exclude `password` from every API response (use a projection or a serialiser).
- Add `recheckPassword` handling: the field exists on `UserDto` but is never compared.

---

## clients — [change]

Current schema: `apps/server/src/app/clients/schemas/client.schema.ts`

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | |
| `type` | enum `INDIVIDUAL` \| `COMPANY` | required, upper-case |
| `name` | string | required, 3–125 |
| `nick` | string | **[new]** optional display label (legacy field) |
| `contactPerson` | string | required, 3–125 |
| `phone` | string | required, 3–15 |
| `email` | string | required, lower-case, valid e-mail |
| `street` | string | required, 3–125 |
| `city` | string | required, 3–125 |
| `zipCode` | string | required, 6 characters, `^[\d./-]+$` |
| `nip` | string | optional; required when `type = COMPANY`, refused for `INDIVIDUAL`; 10–15 chars, `^[\d./-]+$` (enforced in the DTO **and** the schema) |
| `active` | boolean | **[new]** default `true`; a deactivated client is retained for the bookings and reports that reference it (T059, FR-024) |
| `createdAt` / `updatedAt` | Date | **[new]** audit fields (`@Schema({timestamps: true})`) |

**Resolved (T008)**:
- `nick`, `createdAt` and `updatedAt` are present. Timestamps come from
  `@Schema({timestamps: true})`, which Mongoose owns, so no `@Prop` is declared for them.
- The NIP rule is enforced in both layers, from one shared helper
  (`clients/models/client-nip.validator.ts`). The DTO answers a field-level `422`; the schema is
  the backstop for a write that never passes through the DTO. Two halves are needed because
  Mongoose does not run a custom validator on an absent value: `required` carries "a company
  must supply one", and the custom validator carries the format and the "not for an individual"
  rules. A value on an individual is refused rather than ignored, so a user cannot believe a tax
  id was stored when it was not.
- `updateClient` re-checks the rule on the *merged* record, because a partial body may carry
  `nip` without `type` or the reverse, and `updateOne` does not run the schema validator.
- `zipCode` requires exactly 6 characters and `^[\d./-]+$` in the schema and the DTO.
- The delete route is `@Delete(':_id')` — the missing colon was already fixed.
- An index on `name` supports the Clients tab search (`searchSelectedContent(clients, 'name', …)`).

**Open question, still undecided**: uniqueness. `data-model.md` proposed a unique index on
`name`+`city` or on `nip` for companies. Neither is implemented — no decision was recorded, and
a unique index is a data rule that would reject legitimate duplicates (two "Jan Kowalski" in one
city; a shared NIP across two facilities). It needs a decision before it lands.

---

## buildings — [change]

Current schema: `apps/server/src/app/buildings/schemas/building.schema.ts`
Reference data: legacy `building-data-const.ts`

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | |
| `name` | string | required, 3–125 |
| `property` | string | **[new]** required, unique **per city** |
| `city` | string | required, 2–125; free text, **not** a compiled-in list (spec.md §9 open question 1, FR-007) |
| `sizes` | string[] | **[new]** required, non-empty; subset of `1/1`, `1/2`, `1/3`, `2/3`, `1/4`, `3/4` |
| `lighting` | boolean | **[new]** default `false` |
| `toilets` | boolean | **[new]** default `false` |
| `email` | string | required, valid e-mail (facility notification address) |
| `phone` | string | required, 3–15 |
| `street` | string | optional (see below) |
| `zipCode` | string | optional, 6 characters, `^[\d./-]+$` |
| `employees` | string[] | **[new]** names or user references for the Facilities tab |
| `active` | boolean | **[new]** default `true`; a deactivated facility is withheld from the public read and refused on booking (T059, FR-010) |

**Changes needed**:
- The current schema has no `property`, `sizes`, `lighting`, `toilets`; it cannot identify a
  facility. Legacy `IBuilding.size` is renamed to `sizes`, `extra.lighting`/`extra.toilets`
  are promoted to top-level booleans.
- `employees` is typed as `Array<TUser>` but the legacy data holds plain names. **Decided
  (T009)**: store names for display; references plus a resolved display name wait for user
  management (T051), which does not exist yet and would leave the Facilities tab empty.
- Seed data: the 12 facilities in the spec's section 4, seeded by `ReferenceDataService`
  (T012) on the `{city, property}` key. See research.md R6.
- `street`/`zipCode` are **optional, not required** (T012). Neither spec.md §4, FR-009 nor the
  legacy `building-data-const.ts` carries a facility address; the fields were `required` only
  because the building schema was copied from the client schema, error text included. Making
  them optional is what lets the seed hold real data rather than twelve invented addresses.
- `BuildingSchema` was missing the `@Schema()` decorator on the class, unlike the other
  schemas; T009 added it. Verified against `SchemaFactory.createForClass`, which only reads
  the `@Prop` metadata the decorator registers.

---

## bookings — [change]

Current schema: `apps/server/src/app/bookings/schemas/booking.schema.ts`

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | |
| `type` | enum `INDIVIDUAL` \| `COMPANY` | required, upper-case |
| `place` | `{ place: string, city: string }` | required |
| `size` | string | required, `^[0-9]/[0-9]$` |
| `clientId` | string | optional reference to `clients._id` |
| `nick` | string | **[new]** required, 3–100; calendar label |
| `personName` | string | required, 3–125 |
| `personCompany` | string | optional, ≤125 (legacy `club`) |
| `personEmail` | string | required, valid e-mail |
| `personPhone` | string | required, 9–15 |
| `month` | number | required, 0–11 (legacy month index); denormalised hint, not used by conflict detection (T054) |
| `bookedTimes` | `BookedTime[]` | required, at least 1 |
| `accepted` | boolean | required, default `false` |
| `archive` | boolean | required, default `false` |
| `rodoAcknowledgement` | boolean | **[new]** optional, default `false`; required for a public submission (FR-011) |
| `comments` | string | optional, ≤525 (legacy `message`) |
| `paymentMethod` | enum `CASH` \| `TRANSFER` \| `FREE` | required |
| `discount` | string | **[new]** optional, `^[0-9]{1,3}%$`, 0–100 |
| `extraOptions` | boolean | **[new]** derived; true when `selectedOptions` is non-empty |
| `selectedOptions` | `SelectedExtraOption[]` | **[new]** lighting / sanitary add-ons with from/to hours |
| `createdBy` / `createdAt` / `modifiedBy` / `modifiedAt` | string / Date | **[new]** audit fields |

**Note on `accepted`/`archive` and the request body** (T023): both are stored fields but are
**not** part of `BookingDto` — the create body and the approve/archive bodies are the only
places they are written, and the create path forces them to `false` regardless of the caller.
A body that tries to set either is refused by `forbidNonWhitelisted`. The contract keeps them
on the `Booking` response shape only. `rodoAcknowledgement` is on `BookingDto` (optional) and
is required by the service for a public submission.

**Note on `paymentMethod`** (resolved, CHK015): the legacy application offers `transfer`,
`cash`, `free` and historically `invoice` (mapped to `transfer`). The pre-rewrite target
enum was `CASH`, `TRANSFER`, `CARD` — it dropped `free` (Bezpłatne) and added `CARD`, which
the business does not use. The enum is now `CASH | TRANSFER | FREE`: `FREE` is retained
because production data uses it and its loss would change reporting, and `CARD` is dropped
because it was never offered. The runtime list and the type are one declaration in
`libs/models/booking.model.ts`, so a DTO that validates with `IsEnum(PAYMENTS)` cannot drift
from `TPayment` again.

**Note on `month`** (T054, #121): `month` is the legacy 0-based index, derived from the
booking's **first** slot. It is a denormalised hint only. Conflict detection no longer reads
it and the conflict query no longer scopes on it: a scalar cannot describe a booking whose
slots straddle a month boundary (30 Sep + 2 Oct), and scoping on the scalar meant the
cross-boundary slot was never compared against bookings in the month it crossed into. The
conflict rule keys on `bookedTimes.day`, and both conflict queries (`GET /bookings/conflicts`
and the approval check) scope by the slot days. `month` is retained because the migration
tool (T041) and the UI form (T035) still carry it; nothing that decides a conflict reads it.

**Indexes** (needed for FR-043 and conflict queries):
- `{ 'place.city': 1, 'place.place': 1, 'bookedTimes.day': 1 }` — the facility scope plus the
  slot day, which is what the conflict queries filter on (T054). Replaces the former
  `{city, place, month, accepted, archive}` key: an index led by the scalar `month` cannot
  serve a query that ranges over the slot days.
- `{ clientId: 1, accepted: 1 }`
- `{ createdAt: -1, _id: -1 }` — `createdAt` alone is not a total order, so two bookings
  created in the same millisecond could swap between pages and a record could be skipped or
  repeated. `_id` trailing it is what makes the list's sort a stable cursor.

**Changes needed**:
- Add the fields marked **[new]**.
- Add the indexes above; the current schema has none.
- Stop scoping conflict detection on the scalar `month` (T054): the rule and both conflict
  queries use `bookedTimes.day`.
- Expose the read model with city/facility names resolved, and the write model with
  `place`/`size` as in the DTO.

---

## bookedTimes (embedded) — [change]

Current schema: `apps/server/src/app/bookings/schemas/booked-time.schema.ts`
(the file name typo `schemta` was corrected in T011)

| Field | Type | Rules |
|-------|------|-------|
| `day` | Date | required; the calendar day |
| `startHours` | Date | required |
| `endHours` | Date | required; must be strictly after `startHours` |
| `status` | enum `INITIAL` \| `DONE` \| `CANCELED` | required, default `INITIAL` |
| `participants` | number | 0–50, optional |
| `comments` | string | ≤525, optional |

**Changes needed**:
- Validate `endHours > startHours` (legacy validated this in the UI only).
- The legacy status value `QUIT` maps to `CANCELED` during migration.
- `participants` is a string in the legacy UI and a number in the schema; the migration must
  coerce, and the API must reject non-numeric input.
- Slots **within one booking** must not overlap (T053). The legacy form checked this in the
  browser (`checkNewAddedBookingTimeConflicts`) and warned rather than refused
  ("Niektóre godziny rezerwacji konfliktują ze sobą"), so the server accepts the booking and
  records the overlap as a warning on create and on the booked-times replacement. The overlap
  predicate is the same one booking-versus-booking conflict detection uses, so a touching
  interval (`end == next start`) is not an overlap. There is no cross-field validator for this
  because the rule spans array elements, not one slot's fields.

**Landed in T011**: the schema file was renamed, `endHours > startHours` is enforced in the DTO
(cross-field, `422`) and defensively in the schema, and `participants` is bounded 0–50 with the
schema rejecting a non-integer. `BookingDto.bookedTimes` now carries `@ValidateNested`, so the
create path validates each slot — it previously checked only that the array was non-empty.

### Slot status vocabulary (CHK014, issue #55)

The enum is `INITIAL | DONE | CANCELED` and the legacy `QUIT` maps to `CANCELED` during
migration (T042). One Polish label is chosen per value, and **the same label is used in the UI,
the CSV export and the printable report**:

| Value | Label | Legacy `BOOKING_STATUS_OPTIONS` (dropdown) | Legacy `transformValue` (table, summary, CSV) |
|-------|-------|--------------------------------------------|-----------------------------------------------|
| `INITIAL` | `Nie rozpoczęta` | Nie odbyła się | Nie rozpoczęta |
| `DONE` | `Zakończona` | Odbyła się | Zakończona |
| `CANCELED` | `Rezygnacja` | Odwołana | Rezygnacja |

The target adopts the **`transformValue`** wording, not the dropdown's, for two reasons. It is
the vocabulary the business already reads in the exported report, so the rewrite's CSV is
byte-compatible with the legacy export and no downstream spreadsheet changes; and the legacy
dropdown was the inconsistent surface (it labelled `QUIT` "Odwołana" while the app's own table,
summary and CSV called it "Rezygnacja"), so matching it would carry the defect forward rather
than correct it.

The UI labels live in `libs/copy` (`COPY.bookings.statusLabels`) and the report labels in
`libs/reporting` (`REPORT_VALUE_LABELS`), deliberately separate maps — the copy is translatable,
the report vocabulary is the legacy Polish a business artefact prints. They are held equal by a
guard in `apps/ui/src/app/features/admin/bookings/bookings-table.spec.ts`, which asserts each UI
label equals `displayValue(status)`; that is the assertion the legacy app never had.

**There is no `REJECTED` status, and none should be added (#196, spec.md §9 Q4).** The tenant's
process is to remove a request it will not fulfil rather than keep a rejected record, so
rejecting a booking is the staff delete (`DELETE /bookings/{_id}`, `AuthGuard('jwt')` +
`assertCanModify`), not a status transition. The vocabulary above is therefore closed: the
status is a property of a *slot* (`INITIAL | DONE | CANCELED`), never of the booking as a whole,
and a `REJECTED` member would be the only whole-booking value. A deleted booking leaves no
orphan reference — the document is gone, so the conflict counter and the public calendar cannot
see it — which is what SC-003 requires.

---

## selectedExtraOptions (embedded) — [new]

| Field | Type | Rules |
|-------|------|-------|
| `options` | `({ lights: true } \| { toilets: true })[]` | at least one |
| `fromHour` | Date | required |
| `toHour` | Date | required, after `fromHour` |

Only facilities with `lighting` or `toilets` set to `true` may carry these options.

---

## Delete policy and referential integrity — [new] (T059, #126)

The data model carries references (a booking names a client and a facility; a user names the
facilities it is assigned to) but the legacy code deleted the referenced document and left the
referrer dangling. The policy below is **restrict**, not cascade: a booking is a historical
record and every reference to it is a party to that record, so removing a party silently drops
the booking from the reports built from it.

| Referenced entity | Referenced by | Hard delete | Supported alternative |
|-------------------|---------------|-------------|-----------------------|
| Client | `Booking.clientId` | refused `409` while any booking references it | `PUT /clients/{_id} {active: false}` |
| Facility | `Booking.place.{city,place}`, `User.buildings` | refused `409` while a booking or a staff assignment references it | `PUT /buildings/{_id} {active: false}` |
| User | `Booking.createdBy` / `modifiedBy` (audit) | refused `409` for the last active administrator; other accounts are deactivated | `PUT /users/{_id} {active: false}` (FR-047) |

**Why a deactivation flag rather than a hard delete.** The legacy `deleteClient` removed the
client document; because the combined summary is built by iterating stored clients and joining
their bookings through `clientId`, every booking of the deleted client then vanished from the
report — a data-loss defect that no error surfaced. The legacy `deleteBuilding` removed the
facility and left the bookings that named it orphaned, so the calendar and the reports named a
facility that no longer existed. A flag keeps the referent for the records that point at it and
lets the *reads* decide what to show, which is where the decision belongs.

**Read behaviour of a deactivated record.**
- A retired facility (`active: false`) is **withheld** from the public `GET /buildings` read
  (the calendar and booking form) and refused on `POST /bookings` with `422`. The read filter is
  `active: {$ne: false}` and the write test is `active === false`, so a legacy document with no
  `active` field reads as active rather than silently disappearing.
- A retired client (`active: false`) is **retained** in the client reads: staff still need to
  find it to look at its history, and it is the booking's counterparty.

**Reference checks.** `ClientService.deleteClient` counts `{clientId: _id}`. `BuildingService.
deleteBuilding` resolves the facility's `{property, city}` and counts bookings on
`{place.place, place.city}` (the pair the booking stores) plus users on `{buildings: property}`.
The staff check is a conservative over-approximation — `User.buildings` carries the property key
with no city — so it may refuse a delete when the same `property` exists in another city.
Refusing in the safe direction is deliberate: the facility can still be deactivated, whereas an
orphaned booking cannot be un-orphaned. A *missing* facility is not an error here: the delete
still runs and reports `deletedCount: 0`, matching the other delete routes.

**What is deliberately not checked.** A booking whose facility name does not resolve is left
alone — the fixtures and the legacy data use placeholder facility names, and the write rule
"must the facility exist?" is a separate decision from "must the client exist?" that this task
does not take.

---

## Relationship summary

```text
City (free text, not a table) 1 ── n Facility (buildings)
Facility            1 ── n Booking        (via place.place + place.city)
Client              1 ── n Booking        (via clientId, optional)
Booking             1 ── n BookedTime     (embedded)
Booking             1 ── n SelectedExtraOption (embedded)
User (EMPLOYEE)     n ── n Facility       (via Facility.employees)
User                n ── 1 City           (via User.city)
```

## Validation summary (server-side, mandatory)

| Entity | Key rules |
|--------|-----------|
| User | e-mail format and uniqueness, password 6–30, names ≥3, role required, city required unless `ADMIN` |
| Client | type enum, e-mail format, phone 3–15, zip `^[\d./-]+$` and length 6, NIP required for `COMPANY` |
| Facility | `property` unique per city, `sizes` non-empty and from the allowed set, valid contact e-mail, delete refused while referenced (T059) |
| Booking | at least one `bookedTimes` entry, `month` 0–11, `size` matches the facility's allowed sizes (enforced on create and update, T052), payment enum, discount 0–100 % |
| BookedTime | `endHours` after `startHours`, `status` enum, `participants` 0–50 |
