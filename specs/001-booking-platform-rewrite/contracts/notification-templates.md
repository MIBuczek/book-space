# Notification e-mail templates

This is the contract for the six notification e-mails (FR-032, FR-033, FR-034, FR-041, FR-052).
It exists because the templates the legacy app used live inside EmailJS and are **not** in the
legacy repository: the wording, subject lines and field layout are only discoverable from the
EmailJS account. What *is* in the repository is the variable set the legacy code built in
`utils/functions/email-services.ts`, and that variable set is the part that must not change —
a downstream recipient or a spreadsheet depends on the field names, not on the styling.

Four of the six are the legacy templates; the two applicant templates (`booking-approved`,
`booking-rejected`) are new (FR-052, T062) — the legacy app never notified the requestor of a
decision, so there is no legacy id or variable set to preserve for them. They reuse the same
booking variables the legacy bodies used, so the field names still come from one place.

The renderer and the assets live in `apps/server/src/app/notification/templates/`. The
placeholder syntax is `{{name}}` for a required variable and `{{#name}}…{{/name}}` for an
optional block that is dropped when its value is empty.

## Source of truth

| Legacy constant (`email-service-data.ts`) | Service | Template id |
| --- | --- | --- |
| `ADMIN_TEMPLATE_BOOKING_ID` | SISK (`service_z83jspu`) | `template_5l7nfa5` |
| `USER_TEMPLATE_BOOKING_ID` | SISK (`service_z83jspu`) | `template_gsvb2al` |
| `USER_MIB_TEMPLATE_MESSAGE_ID` | MIB (`service_37tym6s`) | `template_730331f` |
| `USER_MIB_TEMPLATE_EMPLOYEE_ID` | MIB (`service_37tym6s`) | `template_izso2cm` |

The legacy dispatch (`storeEmailNotification`) chose the template by *who created the booking*:
`isAdmin` sent `ADMIN_TEMPLATE_BOOKING_ID`, otherwise `USER_TEMPLATE_BOOKING_ID`. The rewrite
keeps the two templates but selects by **audience**, because the route is an explicit operator
action rather than an implicit side effect of the write:

- `audience: FACILITY` → `booking-facility` (`ADMIN_TEMPLATE_BOOKING_ID`)
- `audience: STAFF` → `booking-staff` (`USER_TEMPLATE_BOOKING_ID`)
- `audience: APPLICANT` → `booking-approved` or `booking-rejected`, chosen from the booking's
  stored `accepted` flag (FR-052)

## `booking-facility` — facility notified of a staff booking

- **Recipient**: the facility's `email` field, read from the building record. Never from the
  request body (FR-035).
- **Legacy template**: `ADMIN_TEMPLATE_BOOKING_ID` (`template_5l7nfa5`).
- **Subject**: `Nowa rezerwacja: {{building}} ({{city}})`.
- **Variables**: `building`, `city`, `payment`, `person`, `club`, `email`, `phone`,
  `parsedBookingTime`, `message`, `buildingEmail`.
- **Differences from the staff variant**: carries `buildingEmail` (the facility's own address,
  so the body can show it), and joins the slot lines with a newline.

## `booking-staff` — SISK notified of a public request

- **Recipient**: `SISK_CONTACT_EMAIL` from server configuration.
- **Legacy template**: `USER_TEMPLATE_BOOKING_ID` (`template_gsvb2al`).
- **Subject**: `Nowa prośba o rezerwację: {{building}} ({{city}})`.
- **Variables**: `building`, `city`, `payment`, `person`, `club`, `email`, `phone`,
  `parsedBookingTime`, `message`.
- **Differences from the facility variant**: no `buildingEmail`, and the slot lines are joined
  with `" / "` (the legacy `emailUserBodyBooking`).

## `contact-message` — public contact form

- **Recipient**: `SISK_CONTACT_EMAIL` from server configuration.
- **Legacy template**: `USER_MIB_TEMPLATE_MESSAGE_ID` (`template_730331f`).
- **Subject**: `Wiadomość od {{person}}`.
- **Variables**: `person`, `email`, `phone`, `message`. `phone` is optional and its block is
  dropped when absent.
- **Legacy shape** (`FormMessage.tsx` → `IMessageForm`): `person`, `email`, `phone`, `message`.

## `employee-message` — message to a selected facility employee

- **Recipient**: the employee address supplied by the operator on the Facilities tab (FR-041).
- **Legacy template**: `USER_MIB_TEMPLATE_EMPLOYEE_ID` (`template_izso2cm`).
- **Subject**: `Wiadomość od {{person}}`.
- **Variables**: `person`, `email`, `message`.
- **Legacy shape** (`Building.tsx` → `IEmployeeMessage`): `person` (the selected employee's
  name), `email` (the facility address the message is sent from), `message`.

## `booking-approved` — applicant notified their request was approved

- **Recipient**: the booking's own `personEmail` (the applicant). Never from the request body
  (FR-035).
- **Legacy template**: none. This e-mail is new (FR-052, T062); the legacy app never notified
  the requestor of a decision.
- **Subject**: `Rezerwacja zatwierdzona: {{building}} ({{city}})`.
- **Variables**: `building`, `city`, `payment`, `person`, `club` (optional),
  `parsedBookingTime`, `message` (optional).
- **Selection**: sent when the booking's stored `accepted` flag is `true`.
- **Difference from the facility/staff variants**: it is addressed to the requestor, so it does
  not carry `buildingEmail` (the facility's own address) or `email`/`phone` (the requestor's own
  details, which they already know).

## `booking-rejected` — applicant notified their request was rejected

- **Recipient**: the booking's own `personEmail` (the applicant).
- **Legacy template**: none (FR-052, T062).
- **Subject**: `Rezerwacja odrzucona: {{building}} ({{city}})`.
- **Variables**: the same set as `booking-approved`.
- **Selection**: sent when the booking's stored `accepted` flag is `false`.
- **Why two templates, not one with a status variable**: the subject and the opening sentence
  are the decision, and a single template would have to carry the decision as data — which is
  how a body ends up saying "approved" for a rejected booking. Selecting the asset from the
  stored flag means the two cannot disagree.

## Variable derivation

The booking variables are produced from the stored booking exactly as the legacy
`emailAdminBodyBooking` / `emailUserBodyBooking` did:

| Variable | Source |
| --- | --- |
| `building` | `modelDisplayValue('building', booking.building)` — the Polish facility label |
| `city` | `modelDisplayValue('city', booking.city)` — the Polish city label |
| `payment` | `modelDisplayValue('payment', booking.payment)` — `Gotówka`/`Przelew`/`Bezpłatne` |
| `person` | `booking.personName` |
| `club` | `booking.personCompany` (optional) |
| `email` | `booking.personEmail` |
| `phone` | `booking.personPhone` |
| `parsedBookingTime` | one line per slot from `flatBookingTime`, joined per variant |
| `message` | `booking.comments` (optional) |
| `buildingEmail` | the facility's `email` (facility variant only) |

`flatBookingTime` is the legacy slot format:

```
Rezerwacja na dzień : <date>,
Godzina rozpoczęcia : <start>,
Godzina zakończenia : <end>
```

The legacy `formatDate`/`formatTime` used `toLocaleDateString()`/`getHours()`, i.e. the
*viewer's* browser locale. The rewrite formats through `facilityWallClock` so the same booking
renders identically regardless of where the server runs.

The legacy payload always *carried* `club` and `message`, even when they were empty, because
`emailAdminBodyBooking` destructures them unconditionally. A template that printed a bare
`Firma:` label for a client with no company is the reason `club`, `message` and `phone` are
optional blocks here: the line is dropped rather than rendered with a dangling label. The
variable set is unchanged — the value is still supplied when it exists.

## Deliberate differences from the legacy templates

The legacy EmailJS templates are HTML with styling that is not in the repository. The assets
here are the **text** bodies that preserve the variable set and the field order; the exact HTML
markup is not reproduced. That is a known gap, recorded in T058's issue: obtaining the original
markup requires the EmailJS account. What the acceptance criteria require — no unresolved
placeholder, documented recipients and variable sets, both booking variants covered — is met by
the assets here.

## Applicant decision notification (resolved)

`spec.md` open question 5 asked whether the **applicant** should be notified when a request is
approved or rejected. It is **answered yes** (FR-052, T062): an administrator may notify the
requestor, through the `APPLICANT` audience of `POST /notifications/booking`. It is an explicit
operator action rather than an automatic side effect of the approve/reject write, so the
operator decides when the applicant is contacted. The two templates above are that e-mail; the
recipient is the booking's stored `personEmail` and the template is selected from the booking's
stored `accepted` flag, so the message cannot claim a decision the record does not carry.

The `APPLICANT` audience is administrator-only, matching the approve/reject routes; the
controller enforces it because it needs the authenticated role, which the request body cannot
be trusted to name.
