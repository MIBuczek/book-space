# Research: Azure Deployment and ServiceNow Integration

**Date**: 2026-11-08 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Each finding is a decision with its source. Sources are Microsoft Learn pages read on
2026-11-08; the repository facts were read from the tree.

---

## R1 — Cosmos DB for MongoDB is wire-protocol compatible, so the app is unchanged

**Decision**: target **Azure Cosmos DB for MongoDB**. The API's data code does not change; only
`DB_URI` and the migration's `--target` point at Cosmos.

**Evidence**:
- "Azure Cosmos DB for MongoDB 6.0/7.0 enables you to use familiar MongoDB features… Any client
  driver that understands these protocols should be able to connect… accounts have an endpoint in
  the format `*.mongo.cosmos.azure.com`." — *6.0 / 7.0 Supported Features and Syntax*.
- The repository's only database seam is `DB_URI`: `app.module.ts` passes it to
  `MongooseModule.forRoot`, and `env.validation.ts` requires `/^mongodb(\+srv)?:\/\//`. A Cosmos
  MongoDB-API connection string matches, so **no code change**.

**Consequence**: the risk is concentrated in *compatibility of the specific features used*, not in
the connection.

---

## R2 — Unique indexes must exist before data (RU-based) — this reorders the migration

**Decision**: create collections and unique indexes **while empty**, before the seed and the
migration write anything. `infra/scripts/ensure-collections.ts` does this idempotently.

**Evidence** (Microsoft Learn, *Indexing*):
- "You can only create unique indexes when the collection has no documents."
- "Popular MongoDB migration tools try to create unique indexes after importing the data. To work
  around this issue, manually create the corresponding collections and unique indexes instead of
  letting the migration tool try. You achieve this behavior for `mongorestore` by using the
  `--noIndexRestore` flag."
- On a **sharded** collection "all unique indexes … are compound indexes, and one of the fields is
  the shard key."

**Repository facts that make this bite**:
- `apps/server/src/app/users/schemas/user.schema.ts` — `email` is `unique: true`.
- `apps/server/src/app/buildings/schemas/building.schema.ts` —
  `BuildingSchema.index({city: 1, property: 1}, {unique: true})`.
- `apps/server/src/app/buildings/seed/reference-data.service.ts` upserts on that key, so the index
  must already exist or the upsert's uniqueness guarantee is only eventual.

**Consequence**: the migration order is a contract, not a detail (plan § D2). On **vCore** (R5)
this is a safety net; on RU-based it is mandatory.

---

## R3 — Case-insensitive `$regex` scans on RU-based Cosmos

**Decision**: keep the search correct; **measure** its Cosmos cost in the spike. Fallback (only if
the measurement justifies it): a normalised lower-case field searched with a non-`i` regex.

**Evidence** (Microsoft Learn, *Indexing*): "In `$regex` queries, left-anchored expressions allow
index search. However, using the `i` modifier (case-insensitivity) … causes the collection to scan
in all expressions."

**Repository facts**:
- `buildBookingQuery` builds `{$regex: escapeRegExp(term), $options: 'i'}` for the tenant-name
  search (FR-021).
- The clients list (T037) uses the same escaped-regex pattern.

**Consequence**: the data is small (a municipality), so a scan is acceptable; the plan records the
measurement rather than pre-optimising.

---

## R4 — Multi-document transactions are single-collection and non-sharded

**Decision**: do not introduce a cross-collection transaction.

**Evidence** (Microsoft Learn, *6.0/7.0 Supported Features*): "Multi-document transactions are
supported only within a single nonsharded collection. Cross-collection and cross-shard
multi-document transactions aren't yet supported."

**Repository fact**: `grep` for `startSession|withTransaction` finds none — the app uses no
transactions. The approve/archive paths use a single `findOneAndUpdate`, which is safe without a
transaction.

**Consequence**: a future change that wants an atomic write across two collections cannot assume
Cosmos supports it.

---

## R5 — Tier: vCore recommended, RU-based documented

**Decision**: recommend **Cosmos DB for MongoDB vCore** (real MongoDB 5.0–7.0). It removes R2 and
R3 entirely and gives `explain`/`listIndexes` parity with the repo's tests. **RU-based**
(serverless/provisioned) is the cheaper alternative, with R2/R3 as known constraints.

**Evidence**:
- RU-based (serverless/provisioned) is the "API for MongoDB" with the constraints above.
- vCore "provides MongoDB … compatibility … versions 5.0-8.0" and behaves as a real MongoDB.

**Repository fact that favours vCore**: `booking-indexes.integration.spec.ts` asserts indexes via
`listIndexes()` **and** `explain('queryPlanner')`. `explain` is a `mongod` behaviour; on vCore it
works as on `mongod`, on RU-based it does not. Those tests stay on `mongodb-memory-server`
regardless (they test the *schema's* intent), but the parity matters for confidence.

**Consequence**: the Phase 0 spike runs the API and the migration against **both**, and the
decision is locked on the evidence, not on this recommendation alone.

---

## R6 — GitHub Actions → Azure with OIDC (no stored secret)

**Decision**: the release workflow authenticates with a **federated identity credential**; no
Azure client secret is stored in the repository.

**Evidence** (Microsoft Learn, *Connect from Azure with OpenID Connect*): "To use Azure Login with
OpenID Connect authentication in GitHub Actions workflows, you need to configure a federated
identity credential on a Microsoft Entra application or a user-assigned managed identity."

**Repository fact that makes this non-negotiable**: `ci.yml` runs `tools/scan-bundle.js` and
`tools/scan-secrets.js`, and `SC-007` forbids a credential in the bundle. Storing an Azure secret
in GitHub would not fail those scans, but it would contradict the repository's stated security
posture; the plan chooses OIDC because it is strictly better and is the documented path.

---

## R7 — App Service pulls from ACR with a managed identity

**Decision**: both App Services pull images from ACR using a managed identity (`AcrPull`), not a
registry username/password.

**Evidence** (Microsoft Learn, *Deploy a custom container to App Service*): "Pull the image into
App Service by using a managed identity."

**Consequence**: the App Service settings hold no registry credential; the identity is the only
authority, and it can be scoped to a single registry.

---

## R8 — App Service vs Container Apps

**Decision**: **App Service** (the request's choice). Container Apps is noted as the alternative
if scale-to-zero or Dapr-style features are wanted.

**Evidence** (Microsoft Learn, *Compare container options*):
- App Service: "fully managed hosting for web applications … optimized for web applications."
- Container Apps: "serverless microservices and jobs … scale based on traffic … scale to zero",
  built on Kubernetes/Dapr/KEDA, "doesn't provide direct access to the underlying Kubernetes
  APIs."

**Repository fit**: two long-running web apps (a static nginx UI and an API) behind one origin.
App Service fits directly; Container Apps would also fit but adds a revision model the request did
not ask for. **Container Apps Jobs** are the natural home for the **migration** run (a one-off,
run-to-completion task) if a containerised migration is preferred over running the Nx tool from a
developer machine — recorded as an option, not a requirement.

---

## R9 — ServiceNow integration shape: server-side, mirroring the mail transport

**Decision**: a `servicenow/` module with an `IServiceNowClient` seam, an unconfigured
implementation that throws, an HTTP implementation using `fetch` with a timeout, and a controller
guarded like the rest of the API. The UI calls the backend only.

**Evidence (repository pattern)**: `notification/mail/mail-transport.ts` already defines exactly
this shape — an `IMailTransport` seam, an `UnconfiguredMailTransport` that throws, and an
`HttpMailTransport` that POSTs with a timeout and maps a non-2xx/timeout to a failure. The
ServiceNow client copies it so the codebase has **one** outbound-provider pattern.

**Evidence (security)**: `SC-007` and `tools/scan-bundle.js` forbid a credential in the client
bundle. A browser→ServiceNow call would need the credential in the bundle, so it is excluded by
construction.

**ServiceNow API fact**: the Table API creates a record with `POST /api/now/table/{table}` and
returns the created record (including `sys_id`). The exact auth (basic vs OAuth) is an open
question; the client supports basic auth first, with a token option.

---

## R10 — Cosmos backup/DR changes the operations runbook

**Decision**: the backup/restore runbook (`docs/operations.md`, T060) is re-pointed at Cosmos.

**Evidence (repository fact)**: `tools/backup` implements `backup`/`restore`/`verify-restore`
against a MongoDB connection string using `EJSON` and the driver. Those commands keep working
against Cosmos **for export** (a driver read), but a **native** Cosmos backup (continuous backup /
periodic) is a platform feature the operator should also enable.

**Consequence**: `operations.md` gains a Cosmos section: enable the account's backup policy, keep
the tool's `verify-restore` for cross-checks, and note the retention/PITR difference from a
self-managed `mongod`.

---

## R11 — The migration tool needs no rewrite, only a target and an order

**Decision**: `tools/migration` is unchanged in shape. Its `--target` points at Cosmos, and the
runbook enforces the R2 order (collections + indexes first).

**Evidence (repository fact)**: `tools/migration/src/lib/cli.ts` takes `--source <dir> --target
<uri> [--dry-run]`, connects with `mongoose.createConnection`, and writes through bound models.
Nothing there is MongoDB-server-specific beyond the driver; `--dry-run` already supports a
rehearsal (the T043 flow).

**Consequence**: T043 (#47) changes only its **target** and its **ordering**, not its code.

---

## Sources

- Microsoft Learn — *Azure Cosmos DB for MongoDB: 6.0 / 7.0 Supported Features and Syntax*.
- Microsoft Learn — *Azure Cosmos DB for MongoDB: Indexing* (unique-index-on-empty, `$regex`
  scan).
- Microsoft Learn — *Compare Azure container options* (App Service vs Container Apps).
- Microsoft Learn — *Deploy a custom container to Azure App Service* (managed-identity pull).
- Microsoft Learn — *Connect to Azure from GitHub Actions with OpenID Connect*.
- Repository: `apps/server/src/app/app.module.ts`, `config/env.validation.ts`,
  `users/schemas/user.schema.ts`, `buildings/schemas/building.schema.ts`,
  `notification/mail/mail-transport.ts`, `tools/migration/src/lib/cli.ts`, `.github/workflows/ci.yml`,
  `apps/server/Dockerfile`, `apps/ui/Dockerfile`, `README.md` § Deployment.
