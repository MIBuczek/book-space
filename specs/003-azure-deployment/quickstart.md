# Quickstart: Azure Deployment (Azure DocumentDB, App Services, Internal Backend)

Two runbooks: **local** (prove the code against Azure DocumentDB before touching Azure) and
**deploy** (prove the pipeline and the private topology). Both are checklists, so a run is
repeatable.

## A. Local — the API against Azure DocumentDB

Prerequisites: an Azure subscription with permission to create an **Azure DocumentDB** cluster
(the MongoDB-compatible vCore service), and the repository's tooling (`npx yarn`, `nx`).

1. **Create the cluster.** Azure DocumentDB, region Poland Central (or the operator's choice),
   smallest tier that fits. Note the connection string.
2. **Run the compatibility assessment first** (FR-018): the Azure DocumentDB migration extension
   for VS Code scans the source and reports unsupported operators. Resolve or record each.
3. **Create the database and indexes before any data** (research R2):

   ```bash
   # Uses the same DB_URI contract; idempotent.
   DB_URI='mongodb+srv://<user>:<pass>@<cluster>.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false' \
     npx nx run ensure-collections:run -- --target "$DB_URI"
   ```

   This creates `book_space`, the four collections and every index in `data-model.md` § 2. (On
   this tier it is good practice rather than a hard requirement — a unique index can be added at
   any time.)
4. **Boot the API against the cluster:**

   ```bash
   cd apps/server
   DB_URI="$DB_URI" JWT_SECRET="$(openssl rand -base64 48)" \
     SEED_REFERENCE_DATA=true \
     npx nx serve server
   ```

5. **Smoke it:** `GET /api/buildings` returns the twelve facilities; `POST /api/auth/sign-in`
   works; the public calendar returns bookings for a period.
6. **Run the DocumentDB suite** (opt-in; skipped without `DB_URI`):

   ```bash
   DB_URI="$DB_URI" npx nx test server --testPathPattern='\.documentdb\.spec\.ts$'
   ```

   This is the suite that runs the repo's own integration behaviour against the real cluster
   (unique indexes, `explain`, the search timing).

## B. The migration into Azure DocumentDB

> **The database is private** (decision 3), so this run needs a network path into the VNet. Run it
> from a **VNet-joined job** (recommended: a Container Apps Job with VNet integration), a jump-box
> VM, or — only for a short, recorded window — after adding a temporary firewall rule for the
> operator's IP (research R11).

```bash
# 1. Take the legacy export (personal data — never commit it).
#    tools/migration reads a directory of <collection>.json files (see loader.ts).
# 2. Rehearse — no writes:
npx nx run migration:run -- --source ./legacy-export --target "$DB_URI" --dry-run
# 3. Run for real (collections + indexes from step A3):
npx nx run migration:run -- --source ./legacy-export --target "$DB_URI"
# 4. Reconcile (SC-003): the tool prints the per-collection counts and reference checks.
#    A non-zero exit code stops the cut-over.
```

## C. Azure — provision the infrastructure

```bash
# One-time: an OIDC federated identity so GitHub can log in without a secret (research R5).
# Then:
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/params/prod.bicepparam
```

Provisioned (all from code — FR-012): the container registry, the two App Services (Linux,
container, **Standard+ with a staging slot**, the frontend on a **custom domain with a managed
certificate**), the managed identities (`AcrPull` on the registry), the **Azure DocumentDB
cluster**, the **VNet and its subnets**, the **two private endpoints** (backend and database,
public access disabled), the **two private DNS zones** and their links, and the frontend's **VNet
integration**. Fill the App Service settings from `contracts/deployment.md` § 3–4; put credentials
in Key Vault references.

## D. Release — build, push, deploy

1. Merge to `main`.
2. `release.yml` runs: builds both images, pushes `book-space-{server,ui}:<sha>`, deploys to the
   **staging slot**, smoke-tests, then **swaps** it into production.
3. **Verify through the frontend** (the backend is private — plan § D7):

   ```bash
   # The whole chain in one request: frontend → proxy → VNet → private endpoint → API → private DB
   curl -sS https://<custom-domain>/api/buildings | jq length   # 12
   ```

4. **Rollback**: swap the slot back (or re-deploy the previous `<sha>` tag) — SC-006.

## E. Verify the private backend and database (US3, SC-005)

```bash
# 1. Public internet — must NOT reach the API (connection refused, or a platform 403; never 200):
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings
# 2. Through the frontend (custom domain) — must return 12:
curl -sS https://<custom-domain>/api/buildings | jq length
# 3. Inside the VNet (jump box / VNet-joined job) — must return 200:
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings
# 4. The database from a public machine — must fail to connect (no public endpoint):
mongosh "$DB_URI" --eval 'db.runCommand({ping:1})'
```

Check 1 is the acceptance test for US3; check 2 proves the chain works; check 4 proves the
database is private too.

## F. Definition of done

- [ ] CI green on the PR (lint, tests, build, secret scan).
- [ ] `release.yml` deploys on merge with **no stored Azure secret** (OIDC) and swaps a slot.
- [ ] The API runs against Azure DocumentDB; the twelve facilities and the migrated bookings are
      present.
- [ ] The compatibility assessment (FR-018) was run and its findings are recorded.
- [ ] Reconciliation (`SC-003`) reports zero loss and zero broken references; a re-run is
      idempotent.
- [ ] The backend's **and the database's** public access are **disabled**; a public request reaches
      neither (SC-005).
- [ ] The frontend reaches both over the private path (the proxied `/api` call succeeds).
- [ ] The frontend serves on the custom domain over TLS.
- [ ] `docs/operations.md` records the DocumentDB backup/restore (PITR), the rollback step and the
      private topology.
