# Quickstart: Azure Deployment (Cosmos DB, App Services, Internal Backend)

Two runbooks: **local** (prove the code against Cosmos before touching Azure) and **deploy**
(prove the pipeline and the private topology). Both are checklists, so a run is repeatable.

## A. Local — the API against Cosmos DB

Prerequisites: an Azure subscription with permission to create a Cosmos DB account, and the
repository's tooling (`npx yarn`, `nx`).

1. **Create the account.** Cosmos DB for MongoDB. Choose the tier per the Phase 0 spike (vCore
   recommended — research R5). Note the connection string.
2. **Create the database and indexes *before* any data** (research R2):

   ```bash
   # Uses the same DB_URI contract; idempotent.
   COSMOS_URI='mongodb://…@<acct>.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb' \
     npx nx run ensure-collections:run -- --target "$COSMOS_URI"
   ```

   This creates `book_space`, the four collections and every index in `data-model.md` § 2 —
   **while the collections are empty**, which is what makes the two unique indexes possible on
   RU-based Cosmos.
3. **Boot the API against Cosmos:**

   ```bash
   cd apps/server
   DB_URI="$COSMOS_URI" JWT_SECRET="$(openssl rand -base64 48)" \
     SEED_REFERENCE_DATA=true \
     npx nx serve server
   ```

4. **Smoke it:** `GET /api/buildings` returns the twelve facilities; `POST /api/auth/sign-in`
   works; the public calendar returns bookings for a period.
5. **Run the Cosmos suite** (opt-in; skipped without `COSMOS_URI`):

   ```bash
   COSMOS_URI="$COSMOS_URI" npx nx test server --testPathPattern='\.cosmos\.spec\.ts$'
   ```

   This is the suite that exercises the features Cosmos treats differently (unique indexes,
   `$regex` search, absence of `explain`).

## B. Local — the migration into Cosmos

```bash
# 1. Take the legacy export (personal data — never commit it).
#    tools/migration reads a directory of <collection>.json files (see loader.ts).
# 2. Rehearse — no writes:
npx nx run migration:run -- --source ./legacy-export --target "$COSMOS_URI" --dry-run
# 3. Run for real (collections + indexes must already exist — step A2):
npx nx run migration:run -- --source ./legacy-export --target "$COSMOS_URI"
# 4. Reconcile (SC-003): the tool prints the per-collection counts and reference checks.
#    A non-zero exit code stops the cut-over.
```

If Cosmos is **private** (open question 3), run this from a machine with VNet access (a VNet-joined
job or a jump box), or add a temporary firewall rule for the operator's IP (research R10).

## C. Azure — provision the infrastructure

```bash
# One-time: an OIDC federated identity so GitHub can log in without a secret (research R7).
# Then:
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/params/prod.bicepparam
```

Provisioned (all from code — FR-012): the container registry, the two App Services (Linux,
container), the managed identities (`AcrPull` on the registry), the Cosmos account, the **VNet and
its two subnets**, the **private endpoint** on the backend (public access disabled), the
**private DNS zone** and its link, and the frontend's **VNet integration**. Fill the App Service
settings from `contracts/deployment.md` § 3–4; put credentials in Key Vault references.

## D. Release — build, push, deploy

1. Merge to `main`.
2. `release.yml` runs: builds both images, pushes `book-space-{server,ui}:<sha>`, updates both App
   Services to that tag.
3. **Verify through the frontend** (the backend is private — plan § D7):

   ```bash
   # The whole chain in one request: frontend → proxy → VNet → private endpoint → API → Cosmos
   curl -sS https://app-book-space-ui.azurewebsites.net/api/buildings | jq length   # 12
   ```

4. **Rollback**: re-deploy the previous `<sha>` tag to both apps (SC-006).

## E. Verify the private backend (US3, SC-005)

```bash
# 1. Public internet — must NOT reach the app (connection refused, or a platform 403; never 200):
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings
# 2. Through the frontend — must return 12:
curl -sS https://app-book-space-ui.azurewebsites.net/api/buildings | jq length
# 3. Inside the VNet (jump box / VNet-joined job) — must return 200:
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings
```

Check 1 is the acceptance test for US3; check 2 proves the chain works.

## F. Definition of done

- [ ] CI green on the PR (lint, tests, build, secret scan).
- [ ] `release.yml` deploys on merge with **no stored Azure secret**.
- [ ] The API runs against Cosmos; the twelve facilities and the migrated bookings are present.
- [ ] Reconciliation (`SC-003`) reports zero loss and zero broken references; a re-run is
      idempotent.
- [ ] The backend's public access is **disabled** and a public request does not reach it (SC-005).
- [ ] The frontend reaches the backend over the private path (the proxied `/api` call succeeds).
- [ ] `docs/operations.md` records the Cosmos backup/restore, the rollback step and the private
      topology.
