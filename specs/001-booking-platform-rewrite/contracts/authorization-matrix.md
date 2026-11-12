# Authorization Matrix — Book Space

Derived from the legacy helpers in `src/utils/functions/credentials-function.ts` and the
component-level guards in `Main.tsx`, `Admin.tsx`, `SideNav.tsx`, `Bookings.tsx`,
`Clients.tsx` and `RecordOpenItem.tsx`. Every row MUST be enforced by the API (FR-003).

Legend: **A** = administrator, **O** = office, **E** = employee, **P** = public (anonymous).

## The capability object the client reads (FR-004)

The client does not re-derive these rules from the role. The API resolves them per request and
returns them as `capabilities` on the sign-in body and on `GET /auth/me` (T033), so a rule the
server owns reaches the UI without being duplicated there, and a capability the server changes
cannot leave the menu advertising a tab the API will refuse. `apps/server/src/app/authorization/capabilities.ts` is the single
derivation; `libs/models/user.model.ts` declares the shape; `contracts/openapi.yaml`
(`UserCapabilities`) is the contract.

| Capability | E | O | A | Legacy source |
|------------|---|---|---|---------------|
| `staff` | ✅ | ✅ | ✅ | `siskEmployeeCredentials` — the Calendar and Bookings tabs |
| `canSeeClientsTab` | ❌ | ✅ | ✅ | `adminSeeContentCredentials` |
| `canSeeFacilitiesTab` | ❌ | ✅ | ✅ | `adminSeeContentCredentials` |
| `canSeeSummaryTab` | ❌ | ✅ | ✅ | `summaryUserRestriction` |
| `canApproveBookings` | ❌ | ❌ | ✅ | `adminCredentials` |
| `canArchiveBookings` | ❌ | ❌ | ✅ | `adminCredentials` |
| `canFilterUnapproved` | ❌ | ❌ | ✅ | `Bookings.tsx` (`user?.isAdmin`) |
| `canSeeConflicts` | ❌ | ❌ | ✅ | `Bookings.tsx` |
| `canManageUsers` | ❌ | ❌ | ✅ | `UsersController` |
| `canWriteClients` | ❌ | ❌ | ✅ | `Clients.tsx` (`adminCredentials`) |
| `canWriteFacilities` | ❌ | ❌ | ✅ | `adminSeeContentCredentials` gate on the tab |
| `canSendFacilityMessages` | ✅ | ✅ | ✅ | `Building.tsx` |

Two capability flags are deliberately narrower than the endpoint they gate. `canSeeFacilitiesTab`
is office/administrator even though `GET /buildings` admits an employee (the booking form needs
the facility list); `canSendFacilityMessages` is every staff member even though the facility
*write* routes are administrator-only. The tab and the action are the stricter gate in each
case, and the endpoint stays as wide as the flow needs.

`capabilitiesFor` is a pure function of `role` alone (open question 3, #195). The legacy
per-account Summary restriction is removed: `canSeeSummaryTab` is office/administrator and
nothing else.

## Role table

| Capability | P | E | O | A | Legacy source |
|------------|---|---|---|---|---------------|
| Read accepted, non-archived bookings, personal fields removed | ✅ | ✅ | ✅ | ✅ | `getBookingDataForUser`, `GET /api/bookings` (T016) |
| Read all bookings (incl. unaccepted/archived) | ❌ | ✅ | ✅ | ✅ | `getBookingsData`, `hasRightsToSeeContent` |
| Create a booking request | ✅ | ✅ | ✅ | ✅ | `Main.tsx`, `BookingForm` (public route, `OptionalJwtAuthGuard`; RODO required for P, T023) |
| Approve / unapprove a booking | ❌ | ❌ | ❌ | ✅ | `adminCredentials` |
| Archive a booking | ❌ | ❌ | ❌ | ✅ | `BookingForm` archive checkbox |
| Edit/delete a booking they created | ❌ | ✅ | ✅ | ✅ | `checkRecordActionPermission` |
| Edit/delete any booking | ❌ | ❌ | ❌ | ✅ | `checkRecordActionPermission` |
| Resolve a booking slot (status/participants/comments) | ❌ | ✅ | ✅ | ✅ | `ModalResolveBooking`, `hasRightsToSeeContent` |
| Reschedule a single slot | ❌ | ✅ | ✅ | ✅ | `RecordOpenItem` (`hasRight = isAdmin \|\| isEmployee`) |
| See bookings awaiting approval filter | ❌ | ❌ | ❌ | ✅ | `Bookings.tsx` (`user?.isAdmin`) |
| See the conflict counter | ❌ | ❌ | ❌ | ✅ | `Bookings.tsx` |
| Notify the applicant of the decision (`POST /notifications/booking`, `APPLICANT`) | ❌ | ❌ | ❌ | ✅ | New (FR-052, T062); administrator-only in the controller, matching the approve/reject routes |
| Read clients | ❌ | ❌ | ✅ | ✅ | `adminSeeContentCredentials` — **enforced (T025)**: `ClientController` is `@Roles('OFFICE','ADMIN')` |
| Create/update/delete clients | ❌ | ❌ | ❌ | ✅ | `Clients.tsx` (`adminCredentials`) — **enforced (T025)**: write routes are `@Roles('ADMIN')` |
| Read facilities and employees | ❌ | ✅ | ✅ | ✅ | `Building.tsx`, `hasRightsToSeeContent` — **enforced (T025)**: the single read and the writes are `@Roles('EMPLOYEE','OFFICE','ADMIN')` and `@Roles('ADMIN')` respectively |
| Read the facility list (city, sizes, options) | ✅ | ✅ | ✅ | ✅ | `getBookingDataForUser` / `Calender.tsx` — the public calendar's selectors and the booking form's size options (FR-007, T034). `GET /buildings` is `OptionalJwtAuthGuard`; an anonymous caller receives a redacted facility (no `email`/`phone`/`employees`/`street`/`zipCode`). The contact details and employee list above stay staff-only |
| Create/update/delete facilities | ❌ | ❌ | ❌ | ✅ | `adminSeeContentCredentials` gate on the tab — **enforced (T025)**: write routes are `@Roles('ADMIN')` |
| Generate summary reports | ❌ | ❌ | ✅ | ✅ | `summaryUserRestriction` |
| Read/update users | ❌ | ❌ | ❌ | ✅ | `UsersController` (`AuthGuard('jwt')` + `RolesGuard`, `@Roles('ADMIN')`) |
| Send a contact message | ✅ | ✅ | ✅ | ✅ | `FormMessage` |
| Send a message to a facility employee | ❌ | ✅ | ✅ | ✅ | `Building.tsx` |

## Notes and defects to correct

1. ~~**Users endpoints are currently over-permissive.** `UsersController` guards every route
   with `AuthGuard('jwt')` only, so any authenticated user — including an employee — can list,
   create, update and delete users. This MUST become administrator-only.~~ **Resolved (T015).**
   `UsersController` now carries `@UseGuards(AuthGuard('jwt'), RolesGuard)` and
   `@Roles('ADMIN')` at the class, so a route added later is restricted by default. The
   sign-in payload carries the stored user's role — taken from the database, never from the
   request body, or a caller could mint a token for a role they do not hold.
   `users.integration.spec.ts` proves the `401`/`403`/`200` split over real HTTP against a
   real signed token; removing the decorators turns its employee cases from `403` back to
   `200`. The last active administrator cannot be deleted, deactivated or demoted:
   `UserService.removesLastAdministrator` reads the target's stored role (not the request's)
   and answers `409` when no other active administrator remains, so the rule cannot be skipped
   by a body that claims the target is not an administrator.
2. ~~**The public read path is currently too broad.** `getBookingDataForUser` filters on
   `accepted` and `archive`, but the Firestore rules allow any authenticated principal to read
   the entire `bookings` collection. The API must be the enforcement point.~~ **Resolved
   (T016).** `GET /api/bookings` runs the `accepted: true, archive: false` filter in the
   Mongoose query, so an unaccepted booking is never read rather than read and discarded.
   `bookings.integration.spec.ts` asserts an anonymous caller receives `[]` when only an
   unaccepted or archived booking exists. The filter is reached through a single `staff`
   boolean in the controller that also selects the response shape; the two cannot disagree,
   which is what the unit spec's fail-closed cases pin.
3. **Client and facility delete routes are broken.** Both controllers declare
   `@Delete('_id')` instead of `@Delete(':_id')`, so the route never matches a real identifier.
4. ~~**Booking ownership is compared by e-mail substring.** `filterBookingsPerPlace` and
   `checkRecordActionPermission` use `record.createdBy.includes(user.email)`. This must become
   an exact identity comparison on a user reference.~~ **Resolved (T017).** The booking schema
   now carries a `createdBy` user reference, stamped from the authenticated user on create and
   never from the request body. `canModifyBooking` compares it for exact equality (case-folded,
   whitespace-trimmed) and treats a missing or empty identity on either side as "not owned", so
   the legacy `''.includes('')` case no longer matches everyone. Update and delete load the
   stored record and refuse a non-owner with `403` before the write, and the service strips
   `createdBy` from the update payload so a caller cannot reassign ownership.
   `booking-ownership.integration.spec.ts` proves the owner/non-owner/administrator split over
   real HTTP against real signed tokens; it also covers the `ObjectId` id the acting user
   actually carries, which a string-only unit test would not.
5. ~~**`summaryUserRestriction` is a hardcoded account.**~~ **Resolved (T033, then removed by
   open question 3, #195).** T033 first made it the `SUMMARY_DENY_LIST` environment variable;
   the restriction has since been removed entirely, because the account belonged to a person no
   longer with the tenant. `canSeeSummaryTab` is office/administrator only, and there is no
   per-account exception — a configured deny-list would be a privilege decision that cannot be
   reasoned about from the role alone.
6. ~~**Public calendar visibility.** A public visitor sees a booking's `nick`, defaulting to
   "Rezerwacja", while staff see `person`. The API MUST NOT return `personName`,
   `personEmail`, `personPhone`, `comments` or `clientId` to a public caller — the legacy
   client simply chose not to display them, which is not a control.~~ **Resolved (T016).**
   Those five fields are removed by `serializePublicBooking` before the response leaves the
   API, from a single `const` list that the spec asserts one name at a time. `clientId` is
   included because it is a foreign key into the client records: leaving it in lets an
   anonymous caller enumerate clients and correlate bookings to one tenant. The integration
   spec asserts the anonymous response *text* does not contain the name, e-mail, phone or
   client id at all — a field present but `undefined` still travels, and a property assertion
   would not see it.

   `nick` is not in the booking schema yet; T010 adds it. Until then the public calendar
   label is whatever the schema carries, and the redaction list is the control regardless of
   which label field exists.

   The two shapes are one route, not two. `GET /api/bookings` is public and staff answers
   differ by *five fields*, so a second endpoint would be a second place for the redaction to
   be forgotten. The guard (`OptionalJwtAuthGuard`) accepts an absent credential but refuses
   an invalid one: downgrading an expired token to an anonymous request would answer a caller
   whose session just ended with a silently redacted calendar instead of a prompt to sign in.

   A note on `active`: `validateUser` now refuses a token whose account was deactivated,
   which it did not before. Sign-in already checked `active`, so deactivation only took
   effect at the next sign-in — and a token lives for a day, so a disabled account kept
   working until it expired. Found by the integration case that deactivates a user and
   re-uses the token it already holds.

## Token and session

| Concern | Decision |
|---------|----------|
| Transport | `Authorization: Bearer <jwt>` |
| Claims | `email`, `_id`, `role`, `iat`, `exp` |
| Expiry | 1 day (existing `signOptions`) |
| Refresh | Not in scope for v1; the user signs in again |
| Sign-out | Client discards the token; `GET /api/auth/sign-out` is retained but stateless |
| Failed auth | `401` with one generic message for every rejection; no user enumeration |
| `/auth/me` | The authenticated user, resolved from the database on each request (T013) |
| Auto-logout | Not required (removed in legacy issue #70) |

**Sign-out is not revocation.** The endpoint clears the `jwt` cookie and returns
`{message: 'Signed out'}`; it destroys no server-side state, so a token captured before
sign-out stays valid until it expires. `auth.integration.spec.ts` asserts this, so the
documented answer cannot drift from the behaviour.

**Sign-in answers identically to every rejection.** An unknown address, a wrong password and
a deactivated account all return `401 Invalid e-mail or password` with the same body. The
distinct messages (`'That email is not registered'` / `'That password is incorrect'`) were
removed: a caller who can tell them apart can enumerate which addresses have accounts. The
unknown-address path also runs a bcrypt comparison against a dummy hash, because returning
early would answer measurably faster and the timing is the same oracle. The reason is still
logged (`auth.sign_in.rejected` with `reason`), so an operator can tell the cases apart.

**`/auth/me` resolves from the database, not the token.** `JwtStrategy.validate` loads the
account, so `role`, `city` and `buildings` reflect the stored values. A response built from
the token's claims would report the values as they were when the token was minted, so an
administrator's change to an account would not appear until the token expired.

**The client revalidates on start, and the capabilities come with it (T033).** `AuthService.restore()`
calls `/auth/me` from an app initializer before the first route resolves, so a token the server
no longer accepts is discarded at start-up rather than on the first click, and a role or
role change is reflected in the navigation without a re-sign-in. `/auth/me` returns no
token, so the restore replaces the stored user and keeps the token; a restore that cleared it
would sign the caller out by refreshing them. The initializer completes rather than errors when
the token is rejected, because a throwing initializer aborts bootstrap and blanks the page.
