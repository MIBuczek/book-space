# Backend Conventions — NestJS 11

Standards for `apps/server`. Applies to all of Phases 1–5 (T010–T031), and to every endpoint
added afterwards.

This is the backend counterpart to `ui-conventions.md`. Where that document fixes how Angular 22
is written, this one fixes how the API is written. It exists because `T010`–`T031` would otherwise
each decide these questions independently, and because the current code contains patterns that
will be copied forward unless they are named and replaced.

Companion documents: `spec.md` (FR-001–FR-044, SC-001–SC-008),
`contracts/openapi.yaml` (the wire contract), `contracts/authorization-matrix.md` (the capability
matrix), `.specify/memory/constitution.md` (Principles I–V).

## Status of the current server

`apps/server` is a working but unhardened NestJS 11 API. It is not a starter shell — it has real
controllers, services and schemas — which is precisely why its conventions need writing down.

| | Count |
|---|---|
| Controllers | 7 |
| Services | 7 (6 domain + `app.service.ts`) |
| Mongoose schema files | 5 |
| Spec files | 17 |

Measured on `main` at the time of writing:

| Pattern | Occurrences | Verdict |
|---|---|---|
| `throw new HttpException(e.message, e.status)` | **22** | defect — returns **HTTP 200** with the driver message |
| `catch (e)` bindings | 23 | 43 `TS18046` errors under `strict` (#105) |
| `@Body(new ValidationPipe())` per parameter | 10 | defect — no `whitelist`, mass-assignment surface |
| `@UseGuards(AuthGuard('jwt'))` | 21 | incomplete — no role decision anywhere |
| Any `role` attribute (schema, JWT, `IUser`) | **0** | the four-role model is unimplemented |
| `select()` / field projection | **0** | password hashes serialised by `GET /users` |
| `@Catch(...)` global filter | **0** | missing |
| `new ValidationPipe()` in `main.ts` | 0 | missing |
| `.lean()` on read paths | 0 | missing on list endpoints |
| Schema `index:` declarations | 0 | missing for the query shapes in the FRs |

Everything below is stated as a rule with its reason. Where a rule can be enforced mechanically,
it says so and names the mechanism; a rule that can only be enforced by review is a rule that will
be broken, so those are marked.

## Non-negotiable conventions

### 1. Errors are mapped in exactly one place

**Rule.** A service throws a typed error. A single global exception filter maps it to a response.
A service never constructs an HTTP response and never reads an HTTP status off a database error.

The current idiom is:

```ts
// apps/server/src/app/bookings/service/booking.service.ts
try {
  return await this.bookingModel.create(booking);
} catch (e) {
  throw new HttpException(e.message, e.status);   // e.status is undefined
}
```

`e` is an `unknown`-typed catch binding. A Mongoose `ValidationError` or `MongoServerError` has no
`status` property — that shape belongs to `HttpException`. So this is
`new HttpException(e.message, undefined)`.

**What that actually returns is worse than a wrong status code.** Verified against the real
`BookingService`, with `model.find()` rejecting with a duplicate-key error and a request to
`GET /api/bookings`:

```
200 {"message":"E11000 duplicate key error collection: users"}
```

`HttpException#getStatus()` returns `undefined` when the second argument is `undefined`, and Nest
writes the response with whatever that yields — **HTTP 200 OK**. A failed database read reports
success, with the raw driver message in the body. A caller cannot distinguish it from an empty
result, and the message discloses collection and field names.

For contrast, measured on the same Nest instance:

| Thrown | Status | Body |
|---|---|---|
| `new HttpException(msg, undefined)` — today's code | **200** | `{"message":"E11000 duplicate key error collection"}` |
| `new HttpException(msg, 400)` — what was intended | 400 | `{"statusCode":400,"message":"E11000 duplicate key error collection"}` |
| `new Error(msg)` — no filter installed | 500 | `{"statusCode":500,"message":"Internal server error"}` |

The third row is the interesting one: a plain `Error` is handled *correctly* and safely. The
`try/catch` that was added to make errors clearer is what makes them silent and leaky. Deleting
these 22 blocks and letting the error propagate would be a strict improvement over keeping them.

This appears 22 times:

```
apps/server/src/app/bookings/service/booking.service.ts             (6)
apps/server/src/app/users/service/user.service.ts                   (5)
apps/server/src/app/clients/service/client.service.ts               (5)
apps/server/src/app/buildings/service/building.service.ts           (5)
apps/server/src/app/authorization/service/authorization.service.ts  (1)
```

**Intended replacement.** A `DomainError` hierarchy for expected failures, and one `@Catch()`
filter:

```ts
// apps/server/src/app/common/errors/domain-error.ts
export class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) { super(404, 'NOT_FOUND', `${what} not found`); }
}

export class ConflictError extends DomainError {
  constructor(message: string) { super(409, 'CONFLICT', message); }
}
```

The filter is the only place that decides a status code. Anything that is not a `DomainError` is a
500 with the detail **logged, not returned** — the message goes to the logger, the client gets the
generic contract shape. A driver message leaking to a client is an information disclosure, and the
existing code leaks it on every failure.

Two consequences worth stating, because both are currently wrong:

- **`catch (e)` must narrow before use.** `e` is `unknown`. Under `strict` the server reports 43
  `TS18046` errors across 23 catch blocks — more errors than blocks, because most blocks read `e`
  twice (`e.message` and `e.status`). The fix is `if (e instanceof DomainError) ...` or an explicit
  type guard, not `e: any`. Typing the error is what makes the mapping possible; the two issues
  share this prerequisite.
- **`validation-error.fun.ts` must be deleted.** It branches on
  `err.message === 'Incorrect email'` — string matching against messages that belong to the legacy
  Firebase implementation, not this API. Worse, `err.message.includes(...)` throws a `TypeError`
  when `message` is absent, so the error handler can itself error. This is a `#105` fix whose
  target this document decides: the messages become `DomainError` subclasses.

**Enforceable by:** a lint rule banning `HttpException` outside the filter directory, or a unit
test over the filter's mapping table. File the lint rule as a follow-up (see *Enforcement gaps*).

### 2. Validation is global and strict

**Rule.** `main.ts` registers one `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and
`transform`. Controllers do not instantiate pipes.

```ts
// apps/server/src/main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

Today `main.ts` registers `cookieParser` and a global prefix, nothing else, and each controller
builds its own pipe per parameter:

```ts
createClient(@Body(new ValidationPipe()) newClient: ClientDto)
```

That is 10 sites, and it is **a security matter, not untidiness**. `new ValidationPipe()` with no
options does not `whitelist` or `forbidNonWhitelisted`, so unknown properties in the request body
pass validation and reach `model.create()`. A minimal probe on this Nest instance, with a DTO
declaring only `name`, shows the difference:

```
POST /no-options  {name:"ok",role:"ADMIN"} -> 201 {"received":{"name":"ok","role":"ADMIN"}}
POST /strict      {name:"ok",role:"ADMIN"} -> 400 {"message":["property role should not exist"]}
```

That probe is synthetic. Run against the real `UsersController` and `UserDto` — which declares only
`firstName`, `lastName`, `password`, `recheckPassword` and `email` — posting those fields plus
`lastLogin` returned `201`, and the service received

```
{"firstName":"Anna","lastName":"Kowalska","password":"secret1","recheckPassword":"secret1",
 "email":"anna@example.com","lastLogin":"1999-01-01T00:00:00.000Z"}
```

`lastLogin` is a `@Prop` on `User`, absent from the DTO, and it reached `model.create()`. Any
schema field the DTO does not declare is settable by the caller. The per-request construction is
the minor problem; the mass-assignment surface is the real one.

Note that `recheckPassword` is also passed straight to `model.create()`. It is not a `@Prop` on
`User`, so Mongoose discards it — but that is the schema happening to be strict, not validation.
The DTO's job is to produce a valid entity, and a field that exists only to be compared should be
removed before the write, not left to the driver to drop.

**This is a documented gap, not a hypothetical.** `zipCode` is declared as a plain `string` with no
`class-validator` decorator in `client.dto.ts` or `building.dto.ts`. `forbidNonWhitelisted` rejects
*unknown* properties; it does not reject a known property with a bad value. Nothing declares
`zipCode` invalid, so no pipe configuration will reject a malformed postal code. Decide explicitly
whether a Polish postal code is validated and where — a `@Matches` on the DTO is the natural place
— rather than assuming the global pipe covers it.

**Enforceable by:** a test that posts an unknown property and asserts 400, plus a lint rule
banning `new ValidationPipe` in `*.controller.ts`. Both are cheap; file them.

### 3. One response shape for errors

**Rule.** The error body is the shape already in `contracts/openapi.yaml`:

```jsonc
{ "statusCode": 422, "message": ["..."], "error": "Unprocessable Entity" }
```

`message` is a `string` for single errors and an `string[]` for validation errors. This is Nest's
default `HttpException` shape, so the contract is already aligned with the framework and the filter
should preserve it rather than invent a new envelope.

**One conflict to resolve.** The contract declares **422** for validation errors on four
operations; Nest's `ValidationPipe` returns **400**. Either the contract moves to 400 or the filter
maps validation failures to 422. The contract is the specification and the UI will be written
against it, so the filter should map to 422 unless there is a reason to change the contract. Decide
once, here, and update `openapi.yaml` if the decision is 400.

### 4. Persistence is behind a service

**Rule.** Controllers never import a Mongoose `Model` or a schema. Access goes through a service.
A repository layer is **not** required — the service is the boundary — but the `Model` must not
leak upward.

Two current gaps:

- **No `.lean()` on read paths.** There are zero uses in the codebase. Every list endpoint
  currently hydrates full Mongoose documents, which matters for the paginated booking and client
  lists in FR-022. Read paths that only serialise should use `.lean()`.
- **No index declarations.** There are zero `index:` entries in any schema; the only index in the
  system is the implicit unique index on `users.email`. The FRs describe query shapes — bookings by
  period (FR-020), by status (FR-021), by owner (FR-005), clients by name — that will do collection
  scans. Declare the indexes with the queries that need them, in `data-model.md`, as each read path
  lands.

### 5. Authorisation is declarative and explicit

**Rule.** Every route carries an explicit access decision. A new endpoint without one is a defect,
not an omission to be caught in review.

**First, the role model does not exist yet.** This is larger than a missing guard. Searching
`apps/server/src` and `libs` for `ADMIN`, `OFFICE`, `EMPLOYEE`, `isAdmin` or `role` returns **no
matches**. `User` has no `role` property; `JwtPayload` is `{email, _id, iat, exp}`; `IUser` in
`libs/models` is `{_id, email, password, firstName, lastName}`. The four-role model in
`contracts/authorization-matrix.md` and FR-004 is entirely unimplemented, so `T014` is not "add a
guard to existing roles" — it is "introduce roles, persist them, put them in the token, and enforce
them". Everything in the matrix is currently unreachable by construction, because there is no
attribute to branch on.

Today there are 21 `@UseGuards(AuthGuard('jwt'))` annotations across 4 controllers, and every one
of them means "any authenticated user". There is no way to express the capability matrix, and a
missing decorator is invisible. Until `T014` lands, `AuthGuard('jwt')` is authentication only, and
a route whose matrix row is not "any authenticated staff" is **known to be wrong**.
`users.controller.ts` is the clearest case: it guards every route with JWT only, so any
authenticated user — including an employee — can list, create, update and delete users. The matrix
requires administrator-only. That is a live privilege escalation, not a future concern.

**Password hashes are returned by read endpoints.** There is no `select()` or field projection
anywhere in the server, and controllers return the service result directly — 21 such returns across
four controllers. `GET /api/users` and `GET /api/users/:_id` therefore serialise the stored bcrypt
hash of every user. Verified against the real `UsersController`:

```
GET /users -> 200 [{"_id":"u1","email":"a@b.c","firstName":"Anna","lastName":"K",
                   "password":"$2b$10$HASHEDVALUE"}]
```

The `User` schema has no `select: false` on `password`, and none is planned, so nothing prevents
this. This is the same class of leak as FR-005 and the `personName` restriction in the matrix, and
it should be fixed by an explicit projection or a response DTO — not by relying on a schema
`select: false` that a future `.lean()` would bypass.

### 6. Configuration

**Rule.** `ConfigModule` with `validateEnv` stays as it is. New keys must be added to **both**
`env.validation.ts` and `.env.example`; a key in one and not the other is a defect, because the
first is what fails fast and the second is what a new contributor copies.

**A verified fact worth recording, so it is not "fixed" into a bug.** `JwtModule.register` reads
`process.env.JWT_SECRET` directly, in the same `imports` array as `ConfigModule.forRoot()`. That
looks like an ordering bug and is not one: `forRoot()` loads `.env` into `process.env`
synchronously, before the next array element is evaluated. Verified by booting a real testing
module with a `.env` file, `ConfigModule.forRoot()` first, and `JwtModule.register` reading the
variable — `JwtService.sign()` then produced a token verifiable with the `.env` secret.

The reason to record it is that the obvious "cleanup" — wrapping `JwtModule` in `registerAsync`
with a `ConfigService` factory — is more code that fixes nothing. It is a legitimate style
preference; it is not a bug fix, and it should not be described as one.

### 7. Naming and layout

**Rule.** Follow the existing convention, which is consistent:

```
<feature>/
  controller/<feature>.controller.ts
  service/<feature>.service.ts
  schemas/<feature>.schema.ts
  models/<feature>.dto.ts
```

`models/` holds DTOs and `schemas/` holds Mongoose schemas. This is not the NestJS default layout
(which has no `controller/` or `service/` subdirectory) and that is fine — it is consistent across
all six features and changing it would be churn.

One known typo: `bookings/schemas/booked-time.schemta.ts`. Already scheduled for rename in `T011`;
do not add new references to the misspelled path.

### 8. NestJS 11 specifics

Anything the 9 → 11 upgrade changed is recorded in `specs/002-dependency-modernization/` and
applies to new code. The ones that affect how endpoints are written:

- **`@nestjs/config` v4** — `ConfigModule.forRoot()` semantics are as described in section 6.
- **Express 5** — route path syntax changed. The `:_id` form in use is correct; the historical
  `@Delete('_id')` bug (a literal segment, never matched) was of this family and is already fixed
  on `main` — both `client.controller.ts` and `building.controller.ts` now use `:_id`, with
  `delete-routes.spec.ts` asserting it over real HTTP. Note that
  `contracts/authorization-matrix.md` still lists this as an outstanding defect; that entry is
  stale.
- **Mongoose 9 / `@nestjs/mongoose` 11** — no callback-style APIs; everything is `Promise`-based,
  which the current services already assume.

### 9. What is deliberately not used

Explicit non-choices, so each implementer does not re-decide them:

- **`@nestjs/swagger`.** The contract is hand-written in `contracts/openapi.yaml` and is the source
  of truth. Decorator-generated docs would create a second, divergent description of the same API.
  If it is adopted later it must generate *from* the DTOs into a checked artifact, not replace the
  contract.
- **CQRS (`@nestjs/cqrs`).** The domain is small and the write paths are ordinary CRUD plus
  conflict detection. Command/query separation would add indirection without a corresponding
  problem.
- **A repository layer.** Section 4 — the service is the boundary. Do not add repositories
  "for testability"; the services are already testable and are tested.
- **Microservices / message transport.** One deployable process, as today.

## Enforcement gaps

Rules that are stated but currently rely on review discipline. Each should become a mechanism, and
each is a candidate follow-up issue rather than a permanent convention:

| Rule | Mechanism | Status |
|---|---|---|
| No `HttpException` outside the error filter | ESLint `no-restricted-imports` scoped to `service/**` | not filed |
| No `new ValidationPipe` in controllers | ESLint `no-restricted-syntax` on `NewExpression` | not filed |
| Unknown body property is rejected | integration test per controller | `T002` (global pipe) |
| Every route has an explicit access decision | lint over controller metadata | blocked on `T014` |

Two of the defects above are already covered by planned tasks, which is why this document states
the rule rather than filing new work: the global pipe and error filter are `T002`, and "a serialiser
that never returns `password`" is explicitly part of `T007`. What was missing was the *reason* —
that today's per-parameter pipe is a mass-assignment surface and today's `catch` returns 200 — so
that the tasks are implemented as fixes rather than as refactors that reproduce the same shape.

The pattern in the table is deliberate: a rule that cannot be enforced is a comment, and comments do
not fail builds. `#106` established the same principle for coverage — the number is enforced by a
threshold, not by a convention that someone remembers to check.

## Stale references to fix

- `contracts/authorization-matrix.md`, "Notes and defects", item 3 — the `@Delete('_id')` defect is
  fixed on `main` and covered by `delete-routes.spec.ts`.
- `apps/server/src/main.ts` header comment ("This is not a production server yet! / This is only a
  minimal backend to get started.") — inaccurate; it is the API described by `spec.md`.
