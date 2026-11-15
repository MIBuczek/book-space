// Non-production deployment parameters (003 T118).
//
// Deliberately smaller and cheaper than production: a single-node database on the smallest tier,
// a smaller plan, and no custom domain (a non-production host uses the App Service default host
// name, so no DNS record is needed). The topology is otherwise identical, so a change verified
// here behaves the same in production.
//
// The two secrets are read from the environment at deploy time rather than written here, because
// a `.bicepparam` is a committed file and a committed password is the leak this deployment is
// built to avoid. Set them before `az deployment group create`:
//
//   export DOCUMENTDB_ADMIN_LOGIN=bookspaceadmin
//   export DOCUMENTDB_ADMIN_PASSWORD='...'
//   export GITHUB_OWNER=...  GITHUB_REPO=...
//
// The region default (`polandcentral`) comes from `main.bicep` and is intentionally not repeated
// here (FR-017): the parameter exists, and its default is the municipality's region.

using '../main.bicep'

param namePrefix = 'bookspace'
param environmentName = 'dev'
param location = 'polandcentral'

// The OIDC federated credential is pinned to these, so the dev identity trusts only this repo's
// `dev` environment.
param githubOwner = readEnvironmentVariable('GITHUB_OWNER')
param githubRepo = readEnvironmentVariable('GITHUB_REPO')
param githubEnvironment = 'dev'

param databaseAdministratorLogin = readEnvironmentVariable('DOCUMENTDB_ADMIN_LOGIN')
param databaseAdministratorPassword = readEnvironmentVariable('DOCUMENTDB_ADMIN_PASSWORD')

// A single node and the smallest tier: a dev cluster does not need HA.
param databaseSkuTier = 'M10'
param databaseHighAvailability = 'Disabled'

// B1 would be cheaper, but slots need Standard, and a dev deployment that cannot exercise the
// slot swap would not test the release path. P0v3 is the smallest SKU that supports slots.
param appServicePlanSku = 'P0v3'

// No custom domain in dev: the App Service default host name is used.
param customDomain = ''

param imageTag = 'dev'

param tags = {
  costCenter: 'engineering'
  purpose: 'development'
}
