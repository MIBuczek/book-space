# Data Model: Azure Deployment and ServiceNow Integration

This feature adds **no application domain entities**. The domain model is unchanged
(`specs/001-booking-platform-rewrite/data-model.md`). What this document fixes is the
**deployment-side model**: the Cosmos database shape, its index and partition decisions, and the
one new external record (a ServiceNow record). It is the reference the migration order (research
R2) and the infra-as-code are checked against.

## 1. Cosmos database

- **Account API**: MongoDB API (`*.mongo.cosmos.azure.com`) or vCore.
- **Database**: `book_space`.
- **Collections**: `users`, `clients`, `buildings`, `bookings`.
  `bookedTimes` is **embedded** in each booking, as on `mongod`.
- **Sharding**: **off** by default. Rationale: the data volume is small (a municipality), and a
  sharded collection makes every unique index compound with the shard key, which would silently
  change the `{city, property}` uniqueness to `{city, property, <shardKey>}` (research R2).

## 2. Indexes (must exist before data — research R2)

| Collection | Index | Kind | Enforces |
|-----------|-------|------|----------|
| `users` | `{email: 1}` | **unique** | one account per address |
| `buildings` | `{city: 1, property: 1}` | **unique** | one facility per city |
| `bookings` | `{createdAt: -1, _id: -1}` | plain | recency list, total order |
| `bookings` | `{place.city: 1, place.place: 1, bookedTimes.day: 1}` | plain | conflict range query |
| `bookings` | `{clientId: 1, accepted: 1}` | plain | per-client reads |
| `clients` | `{name: 1}` | plain | paged/searchable list |
| `clients` | `{name: 1, _id: 1}` | plain | list total order (tie-break) |

The two **unique** indexes are the ones that must be created on an empty collection on RU-based
Cosmos. `infra/scripts/ensure-collections.ts` creates the collections and every index above
idempotently, **before** the seed and the migration write.

> Note: the compound index `{createdAt: -1, _id: -1}` is a deliberate total order (two bookings
> created in the same millisecond must not swap between pages). Cosmos honours a compound index,
> but the repo's `explain('queryPlanner')` assertion of it is a `mongod` property — that test stays
> on `mongodb-memory-server`; a Cosmos check is the opt-in suite.

## 3. Migration ordering (the contract)

```text
1. create database + collections            (empty)
2. create the indexes above                 (while empty — mandatory on RU-based)
3. seed the 12 reference facilities         (reference-data.service, idempotent upsert)
4. run tools/migration  --source <export dir> --target <cosmos uri>
5. reconcile (SC-003) and sign off (#47 / T043)
```

Steps 1–2 are `ensure-collections.ts`; step 3 is the existing seed; step 4 is the existing tool;
step 5 is the existing reconciliation. Re-running 1–4 is idempotent.

## 4. Backup / DR (operations)

| Aspect | On a self-managed `mongod` | On Cosmos DB |
|--------|----------------------------|--------------|
| Backup | `tools/backup backup` (EJSON export) | Account-level continuous/periodic backup **and** the tool's export for portability |
| Restore | `tools/backup restore` | Account restore (PITR) or the tool's `restore` for a cross-account move |
| Verify | `tools/backup verify-restore` | unchanged — it compares two connection strings |

`docs/operations.md` (T060) gains a Cosmos section recording this. The tool is unchanged; the
operator gains a second, platform-level restore path.

## 5. ServiceNow record (external, not stored by default)

- **Not** a domain entity and **not** persisted in Cosmos unless a later task requires it.
- The API returns `{number, sysId}` to the caller; the ServiceNow instance is the system of record.
- If a future task wants a local audit row (who raised what, when), that is a **new** decision and
  a new collection, not part of this feature.

## 6. No schema changes to the application

The Mongoose schemas, the DTOs and the HTTP contract are unchanged. This feature changes **where**
the data lives and **how** it is deployed, not **what** it is.
