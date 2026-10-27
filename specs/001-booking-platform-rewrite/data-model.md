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
| `nip` | string | optional; required when `type = COMPANY` (enforced in the DTO, not the schema) |
| `createdAt` / `updatedAt` | Date | **[new]** audit fields |

**Changes needed**:
- Add `nick`, audit timestamps, and a unique index on `name`+`city` or on `nip` for companies
  (decide during clarification — open question 4 relates to audit only, not uniqueness).
- `zipCode` validation currently requires exactly 6 characters; Polish postal codes are
  `NN-NNN` (6 characters) so this is correct, but the DTO must mirror it.
- The delete route in `client.controller.ts` is `@Delete('_id')` — it is missing the colon and
  therefore never matches a real id. **Defect to fix.**
- `BuildingDto` has the same `@Delete('_id')` defect in `building.controller.ts`.

---

## buildings — [change]

Current schema: `apps/server/src/app/buildings/schemas/building.schema.ts`
Reference data: legacy `building-data-const.ts`

| Field | Type | Rules |
|-------|------|-------|
| `_id` | ObjectId | |
| `name` | string | required, 3–125 |
| `property` | string | **[new]** required, unique **per city** |
| `city` | string | required; one of `siechnice`, `radwanice`, `swieta-katarzyna`, `zerniki-wroclawskie` |
| `sizes` | string[] | **[new]** required, non-empty; subset of `1/1`, `1/2`, `1/3`, `2/3`, `1/4`, `3/4` |
| `lighting` | boolean | **[new]** default `false` |
| `toilets` | boolean | **[new]** default `false` |
| `email` | string | required, valid e-mail (facility notification address) |
| `phone` | string | required, 3–15 |
| `street` | string | required |
| `zipCode` | string | required, 6 characters |
| `employees` | string[] | **[new]** names or user references for the Facilities tab |

**Changes needed**:
- The current schema has no `property`, `sizes`, `lighting`, `toilets`; it cannot identify a
  facility. Legacy `IBuilding.size` is renamed to `sizes`, `extra.lighting`/`extra.toilets`
  are promoted to top-level booleans.
- `employees` is typed as `Array<TUser>` but the legacy data holds plain names. Decide: store
  names for display, or references to `users`. **Recommended**: references plus a resolved
  display name in the response.
- Seed data: the 12 facilities in the spec's section 4.
- `BuildingSchema` is missing the `@Schema()` decorator on the class, unlike the other
  schemas — verify that `SchemaFactory.createForClass` behaves as intended.

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
| `month` | number | required, 0–11 (legacy month index) |
| `bookedTimes` | `BookedTime[]` | required, at least 1 |
| `accepted` | boolean | required, default `false` |
| `archive` | boolean | required, default `false` |
| `comments` | string | optional, ≤525 (legacy `message`) |
| `paymentMethod` | enum `CASH` \| `TRANSFER` \| `CARD` | required |
| `discount` | string | **[new]** optional, `^[0-9]{1,3}%$`, 0–100 |
| `extraOptions` | boolean | **[new]** derived; true when `selectedOptions` is non-empty |
| `selectedOptions` | `SelectedExtraOption[]` | **[new]** lighting / sanitary add-ons with from/to hours |
| `createdBy` / `createdAt` / `modifiedBy` / `modifiedAt` | string / Date | **[new]** audit fields |

**Note on `paymentMethod`**: the legacy application offers `transfer`, `cash`, `free` and
historically `invoice` (mapped to `transfer`). The new enum has `CASH`, `TRANSFER`, `CARD` —
it drops `free` (Bezpłatne) and adds `CARD`, which the business does not currently use.
**This must be reconciled**: `free` is used in production data and its loss would change
reporting. Recommended enum: `CASH | TRANSFER | FREE`.

**Indexes** (needed for FR-043 and conflict queries):
- `{ 'place.city': 1, 'place.place': 1, month: 1, accepted: 1, archive: 1 }`
- `{ clientId: 1, accepted: 1 }`
- `{ createdAt: -1 }`

**Changes needed**:
- Add the fields marked **[new]**.
- Add the indexes above; the current schema has none.
- Expose the read model with city/facility names resolved, and the write model with
  `place`/`size` as in the DTO.

---

## bookedTimes (embedded) — [change]

Current schema: `apps/server/src/app/bookings/schemas/booked-time.schemta.ts`
(note the file name typo: `schemta` → `schema`)

| Field | Type | Rules |
|-------|------|-------|
| `day` | Date | required; the calendar day |
| `startHours` | Date | required |
| `endHours` | Date | required; must be after `startHours` |
| `status` | enum `INITIAL` \| `DONE` \| `CANCELED` | required, default `INITIAL` |
| `participants` | number | 0–50, optional |
| `comments` | string | ≤525, optional |

**Changes needed**:
- Validate `endHours > startHours` (legacy validated this in the UI only).
- The legacy status value `QUIT` maps to `CANCELED` during migration.
- `participants` is a string in the legacy UI and a number in the schema; the migration must
  coerce, and the API must reject non-numeric input.

---

## selectedExtraOptions (embedded) — [new]

| Field | Type | Rules |
|-------|------|-------|
| `options` | `({ lights: true } \| { toilets: true })[]` | at least one |
| `fromHour` | Date | required |
| `toHour` | Date | required, after `fromHour` |

Only facilities with `lighting` or `toilets` set to `true` may carry these options.

---

## Relationship summary

```text
City (string enum) 1 ── n Facility (buildings)
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
| Facility | `property` unique per city, `sizes` non-empty and from the allowed set, valid contact e-mail |
| Booking | at least one `bookedTimes` entry, `month` 0–11, `size` matches the facility's allowed sizes, payment enum, discount 0–100 % |
| BookedTime | `endHours` after `startHours`, `status` enum, `participants` 0–50 |
