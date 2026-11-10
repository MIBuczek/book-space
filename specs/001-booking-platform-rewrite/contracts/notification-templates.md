# Notification e-mail templates

This is the contract for the four notification e-mails (FR-032, FR-033, FR-034, FR-041). It
exists because the templates the legacy app used live inside EmailJS and are **not** in the
legacy repository: the wording, subject lines and field layout are only discoverable from the
EmailJS account. What *is* in the repository is the variable set the legacy code built in
`utils/functions/email-services.ts`, and that variable set is the part that must not change —
a downstream recipient or a spreadsheet depends on the field names, not on the styling.

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

## Open item

`spec.md` open question 5 asks whether the **applicant** should be notified when a request is
approved or rejected. That is a fifth e-mail, not one of the four legacy templates. It is
tracked as T062 and is deliberately not implemented until the question is answered.
