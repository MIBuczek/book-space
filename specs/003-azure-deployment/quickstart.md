# Quickstart: Azure Deployment and ServiceNow Integration

Two runbooks: **local** (prove the code against Cosmos before touching Azure) and **deploy**
(prove the pipeline). Both are checklists, not prose, so a run is repeatable.

## A. Local — the API against Cosmos DB

Prerequisites: an Azure subscription with permission to create a Cosmos DB account, and the
repository's tooling (`npx yarn`, `nx`).

1. **Create the account.** Cosmos DB for MongoDB. Choose the tier per the Phase 0 spike
   (vCore recommended — research R5). Note the connection string.
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

## C. Azure — provision the infrastructure

```bash
# One-time: an OIDC federated identity so GitHub can log in without a secret (research R6).
# Then:
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/params/prod.bicepparam
```

Provisioned: the container registry, the two App Services (Linux, container), the managed
identities (`AcrPull` on the registry), and the Cosmos account. Fill the App Service settings from
`contracts/deployment.md` § 3–4; put credentials in Key Vault references.

## D. Release — build, push, deploy

1. Merge to `main`.
2. `release.yml` runs: builds both images, pushes `book-space-{server,ui}:<sha>`, updates both App
   Services to that tag.
3. Verify: the UI loads and the API answers on the App Service hosts; `GET /api/buildings` returns
   twelve facilities.
4. **Rollback**: re-deploy the previous `<sha>` tag to both apps (SC-006).

## E. ServiceNow

1. Set `SERVICENOW_ENDPOINT`, `SERVICENOW_TABLE`, and `SERVICENOW_USER`/`SERVICENOW_PASSWORD`
   (or `SERVICENOW_TOKEN`) as App Service settings (Key Vault references preferred).
2. From the UI, trigger the action; confirm the record number is shown.
3. Unset `SERVICENOW_ENDPOINT` and confirm the action answers **`502`** (never a silent success).
4. Confirm the built bundle contains no ServiceNow value: `node tools/scan-bundle.js dist/apps/ui`.

## F. Definition of done

- [ ] CI green on the PR (lint, tests, build, secret scan).
- [ ] `release.yml` deploys on merge with **no stored Azure secret**.
- [ ] The API runs against Cosmos; the twelve facilities and the migrated bookings are present.
- [ ] Reconciliation (`SC-003`) reports zero loss and zero broken references; a re-run is
      idempotent.
- [ ] ServiceNow works end-to-end from the UI, and fails visibly when unconfigured.
- [ ] `docs/operations.md` records the Cosmos backup/restore and the rollback step.
