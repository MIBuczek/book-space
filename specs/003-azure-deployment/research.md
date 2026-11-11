# Research: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

**Date**: 2026-11-08 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Each finding is a decision with its source. Sources are Microsoft Learn pages read on
2026-11-08; the repository facts were read from the tree. The five open questions from the first
draft are **answered** (spec § Decisions); this document records the evidence behind them.

---

## R1 — The chosen tier is "Azure DocumentDB" (vCore), a real MongoDB

**Decision**: target **Azure DocumentDB** — the MongoDB-compatible vCore service, formerly
"vCore-based Azure Cosmos DB for MongoDB" — not the RU-based "Azure Cosmos DB for MongoDB". The
API's data code does not change; only `DB_URI` and the migration's `--target` point at it.

**Evidence** (Microsoft Learn, *Azure DocumentDB FAQ*):
- "Azure DocumentDB was previously named vCore-based Azure Cosmos DB for MongoDB… The rename didn't
  change existing clusters, connection strings, or APIs."
- "Azure DocumentDB and Azure Cosmos DB for MongoDB (RU) are separate services: Azure DocumentDB
  uses dedicated vCore-based clusters, and Azure Cosmos DB for MongoDB (RU) uses request-unit-based
  throughput."
- "Azure DocumentDB supports MongoDB wire protocol versions 5.0, 6.0, 7.0, and 8.0."
- "Any driver that supports the MongoDB wire protocol connects to Azure DocumentDB, including the
  official MongoDB drivers for Node.js…"
- The connection string (from the Node.js quickstart) is
  `mongodb+srv://<user>:<password>@<cluster>.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000`.

**Repository fact**: the only database seam is `DB_URI` — `app.module.ts` passes it to
`MongooseModule.forRoot`, and `env.validation.ts` requires `/^mongodb(\+srv)?:\/\//`. The
DocumentDB connection string matches, so **no code change**.

---

## R2 — vCore removes the RU-based constraints that shaped the first draft

**Decision**: the migration-ordering constraint and the search-scan workaround are **not
required**. Collections and indexes are still created before data, as good practice, but the
uniqueness rules are not at risk if a collection is populated first.

**Evidence**:
- RU-based Cosmos: "You can only create unique indexes when the collection has no documents." and
  "using the `i` modifier … causes the collection to scan in all expressions." — *Cosmos DB for
  MongoDB: Indexing*.
- vCore / Azure DocumentDB: *indexing* documents **background indexing** and unique constraints
  with no empty-collection rule; *"review query plans with explain()"* is a documented practice —
  *Azure DocumentDB indexing*, *How to read explain output*.

**Consequence**: the earlier "unique index on an empty collection" contract is downgraded to a
convenience (`ensure-collections.ts` still runs first), and the `$regex` search needs no
normalised-column fallback. The plan is simpler than the first draft because the tier is stronger.

---

## R3 — The database is private too (decision 3)

**Decision**: Azure DocumentDB is reached **only privately** — a private endpoint in the VNet,
with public access disabled.

**Evidence** (Microsoft Learn, *Azure DocumentDB FAQ* and *Use Azure Private Link*):
- "Yes. Firewall rules restrict public access, and Azure Private Link exposes your Azure DocumentDB
  cluster through private endpoints in your virtual network."
- "If no firewall rules are added… public network access to the cluster is disabled."
- The private endpoint's resource type is `Microsoft.DocumentDB/mongoClusters`, sub-resource
  `MongoCluster`, and the DNS zone is **`privatelink.mongocluster.cosmos.azure.com`**
  (*Private endpoint DNS configuration*).

**Repository consequence**: the migration and the backup tool build their own connections, so they
must run from a VNet-joined context (R11), not from a workstation.

---

## R4 — The private backend: a private endpoint and VNet integration use different subnets

**Decision**: the backend App Service has **public network access disabled** and a **private
endpoint**; the frontend keeps public inbound (on a custom domain) and gets **VNet integration** on
a **separate subnet** to reach the backend and the database.

**Evidence** (Microsoft Learn, *Use Private Endpoints for Apps*):
- "When you use a private endpoint for your app, you can: Secure your app when you configure the
  private endpoint and disable public network access, which eliminates public exposure."
- "The private endpoint is only used for incoming traffic to your app. Outgoing traffic doesn't use
  the private endpoint. You can inject outgoing traffic to your network in a different subnet
  through the virtual network integration feature."
- "The virtual network integration feature can't use the same subnet as the private endpoint."
- "Private endpoints are available for … **Basic**, Standard, PremiumV2, PremiumV3, PremiumV4,
  IsolatedV2…"

**Evidence** (Microsoft Learn, *Integrate your app with an Azure virtual network*): "Virtual
network integration gives your app access to resources in your virtual network, but it doesn't
grant inbound private access to your app… Refer to private endpoint for inbound private access."

**Repository facts that make this the right shape**:
- The frontend already proxies `/api` (`apps/ui/nginx.conf.template`, upstream `API_UPSTREAM`), so
  the frontend is **already the only caller** of the API — making the backend private is a
  networking change, not an app change.
- The API's own guards (`AuthGuard('jwt')`, `RolesGuard`, `OptionalJwtAuthGuard`) stay as they are
  (FR-011); the private path is additional.

**Consequence**: US3 is a `network.bicep` + `private-endpoint.bicep` concern, and the plan tier
must be Basic or higher (decision 4 sets it higher still, for slots).

---

## R5 — GitHub Actions → Azure with OIDC (no stored secret)

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

## R6 — App Service pulls from ACR with a managed identity

**Decision**: both App Services pull images from ACR using a managed identity (`AcrPull`), not a
registry username/password.

**Evidence** (Microsoft Learn, *Deploy a custom container to App Service*): "Pull the image into
App Service by using a managed identity."

**Consequence**: the App Service settings hold no registry credential; the identity is the only
authority, and it can be scoped to a single registry.

---

## R7 — Deployment slots give a warm swap and a zero-downtime rollback (decision 4)

**Decision**: the plan is **Standard or higher** (PremiumV3 recommended for production), so each
app has a **staging slot**; a release deploys to the slot, smoke-tests it, then swaps.

**Evidence** (Microsoft Learn, *Set up staging environments in Azure App Service*): a staging slot
lets you validate a new build against production configuration and then swap with no downtime;
slots require **Standard or higher**.

**Consequence**: SC-006 (rollback) becomes a **slot swap back**, which is faster and safer than
re-deploying a tag — though re-deploying a previous SHA tag remains a second option.

**Caveat**: a slot is a separate app with its **own** private endpoint (they cannot be shared), so
either a slot private endpoint is provisioned or the first release runs slot-less. Recorded in
`spec.md` edge cases and the params file.

---

## R8 — Custom domain over TLS (decision 5)

**Decision**: the frontend is served on a **custom domain** with an **App Service managed
certificate**; the DNS record and the certificate are part of the infrastructure as code.

**Evidence** (Microsoft Learn, *Map an existing custom DNS name to Azure App Service*): a CNAME/A
record is added at the DNS provider and the domain is verified in App Service before the managed
certificate can issue.

**Consequence**: the smoke test and the browser both use the custom domain; `API_UPSTREAM` stays
the backend's private host name (the proxy is internal to the frontend).

---

## R9 — Region is a parameter; default Poland Central (decision 5)

**Decision**: the region is a Bicep parameter, default **Poland Central**, not a hard-coded value.

**Evidence (repository fact)**: the platform serves SISK, a municipality in **Siechnice, Poland**,
and the data is personal data (booking records). Deploying the compute and the database in a
Polish region keeps the data in the EU and near the users — the FAQ also notes "Network distance
between your application and the cluster affects latency. Deploy your Azure DocumentDB cluster in
the same region as your application."

**Consequence**: the region is reviewable in the params file; the operator can change it without
editing a module.

---

## R10 — App Service vs Container Apps

**Decision**: **App Service** (the request's choice), with Container Apps noted as the alternative
— and as a candidate for the **migration job**.

**Evidence** (Microsoft Learn, *Compare container options*):
- App Service: "fully managed hosting for web applications … optimized for web applications."
- Container Apps: "serverless microservices and jobs … scale based on traffic … scale to zero",
  built on Kubernetes/Dapr/KEDA, "doesn't provide direct access to the underlying Kubernetes APIs."

**Repository fit**: two long-running web apps behind one origin → App Service. The **migration**
(a run-to-completion task that needs VNet access because the database is private, R3) is a natural
**Container Apps Job** with VNet integration — recorded as the recommended way to run it.

---

## R11 — The private database constrains the migration and the backup tool

**Decision**: the migration runs from a **VNet-joined job** (a Container Apps Job, a jump-box VM,
or a temporary firewall rule for the operator's IP — the last only for a short, recorded window).

**Evidence (repository fact)**: `tools/migration/src/lib/cli.ts` connects with
`mongoose.createConnection(uri)` and `tools/backup` does the same; both need a network path to the
cluster. With public access disabled (R3), a workstation has none.

**Consequence**: the T043 runbook (`quickstart.md` § B) is written for a VNet-joined run, and the
backup/DR runbook records the same requirement.

---

## R12 — Backup/DR changes the operations runbook

**Decision**: the backup/restore runbook (`docs/operations.md`, T060) is re-pointed at Azure
DocumentDB.

**Evidence** (Microsoft Learn, *Azure DocumentDB FAQ*): "Backups, with point-in-time restore for up
to 35 days for Production tiers (M30 and larger SKUs)" are included at no extra cost.

**Repository fact**: `tools/backup` implements `backup`/`restore`/`verify-restore` against a
MongoDB connection string using `EJSON` and the driver; those commands keep working against
DocumentDB **for export**, but the platform's **PITR** is the primary restore path.

**Consequence**: `operations.md` records both — the platform PITR (the primary path) and the tool's
export/verify (portability and cross-checks).

---

## R13 — The migration tool needs no rewrite

**Decision**: `tools/migration` is unchanged in shape. Its `--target` points at Azure DocumentDB.

**Evidence (repository fact)**: `tools/migration/src/lib/cli.ts` takes `--source <dir> --target
<uri> [--dry-run]`, connects with `mongoose.createConnection`, and writes through bound models.
Nothing there is MongoDB-server-specific beyond the driver; `--dry-run` already supports the T043
rehearsal.

**Consequence**: T043 (#47) changes only its **target** and its **network path**, not its code.

---

## Sources

- Microsoft Learn — *Azure DocumentDB FAQ* (vCore rename, wire protocol 5.0–8.0, Private Link,
  firewall/public access, PITR backups, migration options).
- Microsoft Learn — *Azure DocumentDB: MQL compatibility* (99.03 % operator compatibility).
- Microsoft Learn — *Azure DocumentDB: Indexing* and *How to read explain output* (background
  indexing, `explain()`).
- Microsoft Learn — *Azure DocumentDB: Use Azure Private Link* and *Manage public access*.
- Microsoft Learn — *Azure Private Link: Private endpoint DNS configuration*
  (`privatelink.mongocluster.cosmos.azure.com`).
- Microsoft Learn — *Azure Cosmos DB for MongoDB: 6.0/7.0 Supported Features* and *Indexing* (the
  RU-based constraints, kept for contrast).
- Microsoft Learn — *Use Private Endpoints for Apps* (private endpoint, public access off, subnet
  separation, plan tiers).
- Microsoft Learn — *Integrate your app with an Azure virtual network* (VNet integration is
  outbound only).
- Microsoft Learn — *Set up staging environments in Azure App Service* (slots, Standard+).
- Microsoft Learn — *Map an existing custom DNS name to Azure App Service* (custom domain + managed
  certificate).
- Microsoft Learn — *Compare Azure container options* (App Service vs Container Apps).
- Microsoft Learn — *Deploy a custom container to Azure App Service* (managed-identity pull).
- Microsoft Learn — *Connect to Azure from GitHub Actions with OpenID Connect*.
- Repository: `apps/server/src/app/app.module.ts`, `config/env.validation.ts`,
  `users/schemas/user.schema.ts`, `buildings/schemas/building.schema.ts`,
  `apps/ui/nginx.conf.template`, `tools/migration/src/lib/cli.ts`, `tools/backup/`,
  `.github/workflows/ci.yml`, `apps/server/Dockerfile`, `apps/ui/Dockerfile`, `README.md`.
