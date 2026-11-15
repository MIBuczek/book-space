// Production deployment parameters (003 T118).
//
// The production posture: PremiumV3 plan (slots, and the headroom the spec recommends), a
// zone-redundant database pair, and the custom domain over TLS. The region stays the default
// (`polandcentral`) from `main.bicep`; it is a parameter so a data-residency change is a one-line
// edit here, not a module change (FR-017).
//
// Secrets are read from the environment, never written here — a committed password is exactly the
// leak this deployment is built to avoid. Before `az deployment group create`:
//
//   export DOCUMENTDB_ADMIN_LOGIN=bookspaceadmin
//   export DOCUMENTDB_ADMIN_PASSWORD='...'
//   export GITHUB_OWNER=...  GITHUB_REPO=...
//
// The App Service settings (`DB_URI`, `JWT_SECRET`, `MAIL_*`) are **not** here either: they are
// applied by the release workflow as app settings / Key Vault references, so the database
// connection string (which contains the password) never enters a Bicep parameter file.

using '../main.bicep'

param namePrefix = 'bookspace'
param environmentName = 'prod'
param location = 'polandcentral'

param githubOwner = readEnvironmentVariable('GITHUB_OWNER')
param githubRepo = readEnvironmentVariable('GITHUB_REPO')
// The federated credential is pinned to this GitHub environment; the release workflow must
// declare `environment: production` for the OIDC exchange to succeed.
param githubEnvironment = 'production'

param databaseAdministratorLogin = readEnvironmentVariable('DOCUMENTDB_ADMIN_LOGIN')
param databaseAdministratorPassword = readEnvironmentVariable('DOCUMENTDB_ADMIN_PASSWORD')

// The smallest tier that still gives point-in-time restore (production tiers are M30+; M10/M20
// are development tiers). Use M30 for a production deployment that relies on platform PITR
// (research R12).
param databaseSkuTier = 'M30'
param databaseHighAvailability = 'ZoneRedundantPreferred'

// PremiumV3: the spec's recommendation for production, and slots (FR-015) require Standard+.
param appServicePlanSku = 'P1v3'

// The frontend's custom domain over TLS (FR-016). Fill from the operator's DNS control; the
// managed certificate issues once the CNAME is in place and the domain is verified.
param customDomain = ''

param imageTag = 'latest'

// Turn this on to give the API staging slot its own private endpoint, so a pre-swap check can
// reach the slot. The default release flow smoke-tests production through the frontend and does
// not need it (plan § D7).
param provisionApiSlotEndpoint = false

param tags = {
  costCenter: 'municipality'
  purpose: 'production'
}
