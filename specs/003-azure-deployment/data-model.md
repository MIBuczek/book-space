# Data Model: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

This feature adds **no application domain entities**. The domain model is unchanged
(`specs/001-booking-platform-rewrite/data-model.md`). What this document fixes is the
**deployment-side model**: the database shape, its index and partition decisions, and the
network topology's data-carrying pieces. It is the reference the migration order (research R2) and
the infra-as-code are checked against.

## 1. Database

- **Service**: **Azure DocumentDB** (the MongoDB-compatible vCore service,
  `Microsoft.DocumentDB/mongoClusters`), MongoDB wire protocol 5.0–8.0 (research R1).
- **Database**: `book_space`.
- **Collections**: `users`, `clients`, `buildings`, `bookings`.
  `bookedTimes` is **embedded** in each booking, as on `mongod`.
- **Sharding**: **off** at this volume. DocumentDB supports sharded and unsharded collections
  side by side, but the municipality's data is far below the multi-terabyte point where sharding
  is warranted (research R1/R2).
- **Network**: reached only over a **private endpoint** (public access disabled — research R3).

## 2. Indexes

| Collection | Index | Kind | Enforces |
|-----------|-------|------|----------|
| `users` | `{email: 1}` | **unique** | one account per address |
| `buildings` | `{city: 1, property: 1}` | **unique** | one facility per city |
| `bookings` | `{createdAt: -1, _id: -1}` | plain | recency list, total order |
| `bookings` | `{place.city: 1, place.place: 1, bookedTimes.day: 1}` | plain | conflict range query |
| `bookings` | `{clientId: 1, accepted: 1}` | plain | per-client reads |
| `clients` | `{name: 1}` | plain | paged/searchable list |
| `clients` | `{name: 1, _id: 1}` | plain | list total order (tie-break) |

`infra/scripts/ensure-collections.ts` creates the collections and every index above idempotently,
**before** the seed and the migration write. On this tier the ordering is good practice rather than
a requirement (a unique index can be added at any time — research R2), but running it first means a
partially-migrated database is never left without its uniqueness rules.

> Note: the compound index `{createdAt: -1, _id: -1}` is a deliberate total order (two bookings
> created in the same millisecond must not swap between pages). DocumentDB supports compound
> indexes and `explain()`, so the intent of the repo's `explain('queryPlanner')` assertion carries
> over; that spec still runs against `mongodb-memory-server`, with a real-cluster check in the
> opt-in suite.

## 3. Migration ordering

```text
1. create database + collections            (idempotent)
2. create the indexes above                 (idempotent; good practice before data)
3. seed the 12 reference facilities         (reference-data.service, idempotent upsert)
4. run tools/migration  --source <export dir> --target <documentdb uri>
5. reconcile (SC-003) and sign off (#47 / T043)
```

Steps 1–2 are `ensure-collections.ts`; step 3 is the existing seed; step 4 is the existing tool;
step 5 is the existing reconciliation. Re-running 1–4 is idempotent. Steps 3–5 run from a
**VNet-joined** context because the database is private (research R11).

## 4. Network topology (the data-carrying pieces)

The topology is not domain data, but it carries the request's "internal backend" requirement, so
it is modelled here and in `contracts/network.md`:

| Piece | Purpose |
|-------|---------|
| VNet + subnets | the backend's private endpoint subnet, the database's private endpoint subnet, and the frontend's VNet integration subnet (each must differ from the endpoints') |
| Private DNS zone `privatelink.azurewebsites.net` | resolves the backend host name to its private IP |
| Private DNS zone `privatelink.mongocluster.cosmos.azure.com` | resolves the database host name to its private IP |
| Backend private endpoint | inbound private access; public access disabled |
| Database private endpoint | inbound private access; public access disabled |
| Frontend VNet integration | outbound access from the frontend to both private endpoints |

No application data flows through these; they carry the API's own traffic.

## 5. Backup / DR (operations)

| Aspect | On a self-managed `mongod` | On Azure DocumentDB |
|--------|----------------------------|---------------------|
| Backup | `tools/backup backup` (EJSON export) | Platform **point-in-time restore** (up to 35 days on production tiers, included) **and** the tool's export for portability |
| Restore | `tools/backup restore` | Platform PITR (the primary path) or the tool's `restore` for a cross-cluster move |
| Verify | `tools/backup verify-restore` | unchanged — it compares two connection strings |

`docs/operations.md` (T060) gains a DocumentDB section recording this. The tool is unchanged; the
operator gains a platform-level restore path that is the primary one.

## 6. No schema changes to the application

The Mongoose schemas, the DTOs and the HTTP contract are unchanged. This feature changes **where**
the data lives, **how** it is deployed, and **who can reach the backend** — not **what** the data
is.
