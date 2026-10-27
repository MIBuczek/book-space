# Authorization Matrix — Book Space

Derived from the legacy helpers in `src/utils/functions/credentials-function.ts` and the
component-level guards in `Main.tsx`, `Admin.tsx`, `SideNav.tsx`, `Bookings.tsx`,
`Clients.tsx` and `RecordOpenItem.tsx`. Every row MUST be enforced by the API (FR-003).

Legend: **A** = administrator, **O** = office, **E** = employee, **P** = public (anonymous).

## Roles

| Capability | P | E | O | A | Legacy source |
|------------|---|---|---|---|---------------|
| Read accepted, non-archived bookings | ✅ | ✅ | ✅ | ✅ | `getBookingDataForUser` |
| Read all bookings (incl. unaccepted/archived) | ❌ | ✅ | ✅ | ✅ | `getBookingsData`, `hasRightsToSeeContent` |
| Create a booking request | ✅ | ✅ | ✅ | ✅ | `Main.tsx`, `BookingForm` |
| Approve / unapprove a booking | ❌ | ❌ | ❌ | ✅ | `adminCredentials` |
| Archive a booking | ❌ | ❌ | ❌ | ✅ | `BookingForm` archive checkbox |
| Edit/delete a booking they created | ❌ | ✅ | ✅ | ✅ | `checkRecordActionPermission` |
| Edit/delete any booking | ❌ | ❌ | ❌ | ✅ | `checkRecordActionPermission` |
| Resolve a booking slot (status/participants/comments) | ❌ | ✅ | ✅ | ✅ | `ModalResolveBooking`, `hasRightsToSeeContent` |
| Reschedule a single slot | ❌ | ✅ | ✅ | ✅ | `RecordOpenItem` (`hasRight = isAdmin \|\| isEmployee`) |
| See bookings awaiting approval filter | ❌ | ❌ | ❌ | ✅ | `Bookings.tsx` (`user?.isAdmin`) |
| See the conflict counter | ❌ | ❌ | ❌ | ✅ | `Bookings.tsx` |
| Read clients | ❌ | ❌ | ✅ | ✅ | `adminSeeContentCredentials` |
| Create/update/delete clients | ❌ | ❌ | ❌ | ✅ | `Clients.tsx` (`adminCredentials`) |
| Read facilities and employees | ❌ | ✅ | ✅ | ✅ | `Building.tsx`, `hasRightsToSeeContent` |
| Create/update/delete facilities | ❌ | ❌ | ❌ | ✅ | `adminSeeContentCredentials` gate on the tab |
| Generate summary reports | ❌ | ❌ | ✅ | ✅ | `summaryUserRestriction` |
| Generate summary reports (denied account) | ❌ | ❌ | ❌ | ❌ | `mkulakowski@umsiechnice.pl` |
| Read/update users | ❌ | ❌ | ❌ | ✅ | `UsersController` (all `AuthGuard('jwt')` today) |
| Send a contact message | ✅ | ✅ | ✅ | ✅ | `FormMessage` |
| Send a message to a facility employee | ❌ | ✅ | ✅ | ✅ | `Building.tsx` |

## Notes and defects to correct

1. **Users endpoints are currently over-permissive.** `UsersController` guards every route
   with `AuthGuard('jwt')` only, so any authenticated user — including an employee — can list,
   create, update and delete users. This MUST become administrator-only.
2. **The public read path is currently too broad.** `getBookingDataForUser` filters on
   `accepted` and `archive`, but the Firestore rules allow any authenticated principal to read
   the entire `bookings` collection. The API must be the enforcement point.
3. **Client and facility delete routes are broken.** Both controllers declare
   `@Delete('_id')` instead of `@Delete(':_id')`, so the route never matches a real identifier.
4. **Booking ownership is compared by e-mail substring.** `filterBookingsPerPlace` and
   `checkRecordActionPermission` use `record.createdBy.includes(user.email)`. This must become
   an exact identity comparison on a user reference.
5. **`summaryUserRestriction` is a hardcoded account.** It should become configuration
   (see open question 3).
6. **Public calendar visibility.** A public visitor sees a booking's `nick`, defaulting to
   "Rezerwacja", while staff see `person`. The API MUST NOT return `personName`,
   `personEmail`, `personPhone` or `comments` to a public caller — the legacy client simply
   chose not to display them, which is not a control.

## Token and session

| Concern | Decision |
|---------|----------|
| Transport | `Authorization: Bearer <jwt>` |
| Claims | `email`, `_id`, `role`, `iat`, `exp` |
| Expiry | 1 day (existing `signOptions`) |
| Refresh | Not in scope for v1; the user signs in again |
| Sign-out | Client discards the token; `GET /api/auth/sign-out` is retained but stateless |
| Failed auth | `401` with a generic message; no user enumeration |
| Auto-logout | Not required (removed in legacy issue #70) |
