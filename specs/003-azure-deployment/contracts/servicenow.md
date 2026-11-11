# Contract: ServiceNow Integration

The ServiceNow capability is **internal and server-side**: the API holds the credential and calls
ServiceNow; the UI calls the API. This contract fixes the seam, the configuration, the routes and
the error mapping so the module and its tests agree with it.

## 1. Shape (mirrors the mail transport)

```text
UI  ──HTTP──▶  /api/servicenow/*  ──▶  ServiceNowService  ──▶  IServiceNowClient  ──▶  ServiceNow
                (AuthGuard + RolesGuard)   (validation,        (seam; Unconfigured + Http)
                                            error mapping)
```

The client seam exists for the same reason `IMailTransport` does: the service depends on an
interface, not on a provider SDK, so a test drives a real client against a mock HTTP server and
the provider can be swapped without touching the service.

## 2. Configuration

All optional. An unconfigured deployment boots and answers a surfaced failure (`502`), never a
silent success (FR-010, matching `FR-036` for mail).

| Setting | Purpose | Default |
|---------|---------|---------|
| `SERVICENOW_ENDPOINT` | Instance base URL, e.g. `https://<instance>.service-now.com` | unset ⇒ unconfigured |
| `SERVICENOW_TABLE` | Table to create records in, e.g. `incident`, `sc_request` | `incident` |
| `SERVICENOW_USER` + `SERVICENOW_PASSWORD` | Basic-auth credential | unset |
| `SERVICENOW_TOKEN` | Alternative bearer/OAuth token (takes precedence if set) | unset |
| `SERVICENOW_TIMEOUT_MS` | Outbound timeout | `10000` (same as the mail transport) |

The endpoint and credential are **server-only** and MUST NOT reach the client bundle (`SC-007`).
They are validated by `env.validation.ts` as optional strings, like `MAIL_*`.

## 3. Routes

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| `POST` | `/api/servicenow/incident` | `AuthGuard('jwt')` + `RolesGuard` | Create an incident/request; answers the created record number |

- The route's `@Roles` is decided by the open question *who may call it* (public contact form →
  `OptionalJwtAuthGuard` like `POST /bookings`; staff only → `@Roles('OFFICE','ADMIN')`).
- The route is declared **before** any `:id` route in the same controller (Express matches in
  declaration order — the `BookingController` note).
- The response is the created record's **number** and `sys_id`, not the whole ServiceNow payload,
  so the API's contract does not leak ServiceNow internals.

## 4. Request / response

Request body (a **concrete DTO class**, so the global `ValidationPipe` sees a type —
`whitelist` + `forbidNonWhitelisted` apply):

```ts
class CreateIncidentDto {
  @IsString() @Length(3, 200) shortDescription!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['1','2','3','4','5']) urgency?: string;   // ServiceNow's own scale
}
```

Response (types live in `libs/models/servicenow.model.ts` so the UI shares them):

```ts
interface IServiceNowRecord {
  number: string;   // e.g. "INC0012345"
  sysId: string;
}
```

Validation failures are **`422`** (the contract's rule), a ServiceNow failure is **`502`**, and a
timeout is **`502`** — the same mapping the mail path uses.

## 5. Error mapping

| Condition | Answer |
|-----------|--------|
| ServiceNow unconfigured | `502` (the unconfigured client throws) |
| ServiceNow non-2xx | `502` |
| Timeout | `502` |
| Invalid body | `422` |
| Not authorised | `401` (no/invalid token) or `403` (role) — from the guards |

A `5xx` never carries the ServiceNow message (the `ErrorExceptionFilter` treats 5xx as opaque and
logs the real cause), so a ServiceNow detail cannot leak to the client.

## 6. Security rules

1. The credential is server-only; the UI never sees it (FR-008).
2. The UI calls the backend only; it never calls ServiceNow (FR-009).
3. The recipient/table is resolved **server-side**, never from the request body, so a caller
   cannot redirect the integration (the `FR-035` rule for mail).
4. The built bundle is scanned by CI and must contain no ServiceNow value (`SC-002`).
