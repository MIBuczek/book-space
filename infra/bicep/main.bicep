// Azure deployment for the booking platform (003, FR-012).
//
// Resource-group scoped. Everything the deployment needs is here: the registry, the identities,
// the App Service plan and its two apps with slots, the Azure DocumentDB cluster, the virtual
// network with its six subnets and two private DNS zones, and the two private endpoints that
// make the backend and the database private. There is **no manual portal step** — that is FR-012,
// and it is what makes the topology reviewable and reproducible.
//
// The resource group itself is not created here. `az deployment group create` needs an existing
// group, and the operator owns the subscription, the group and the naming (spec § Assumptions).
// The region, by contrast, is a parameter (FR-017) so the data-residency choice is explicit.
//
// Ordering is by `dependsOn` where Bicep cannot infer it. Two places need it and both are
// easy to get wrong: the App Services need the ACR pull identity to exist (a role assignment
// cannot be granted to a principal that does not exist yet), and the private endpoints need
// their subnets and DNS zones.

targetScope = 'resourceGroup'

@description('Azure region for every resource. The default is the municipality\'s region (FR-017).')
param location string = 'polandcentral'

@description('Short name prefix for the deployment, e.g. `bookspace`. Lowercase, no spaces.')
@minLength(3)
@maxLength(20)
param namePrefix string

@description('Environment name, used in resource names and tags, e.g. `prod` or `dev`.')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environmentName string = 'prod'

@description('GitHub organisation or user that owns this repository (for the OIDC federated credential).')
param githubOwner string

@description('GitHub repository name (for the OIDC federated credential).')
param githubRepo string

@description('GitHub environment the release workflow uses; the federated credential is pinned to it.')
param githubEnvironment string = 'production'

@description('Azure DocumentDB administrator login.')
param databaseAdministratorLogin string

@description('Azure DocumentDB administrator password. Pass from Key Vault, never inline.')
@secure()
param databaseAdministratorPassword string

@description('Custom domain the frontend is served on, without a scheme. Empty disables the binding (FR-016).')
param customDomain string = ''

@description('App Service plan SKU. Standard or higher for slots (FR-015).')
@allowed([
  'P0v3'
  'P1v3'
  'P2v3'
  'P3v3'
])
param appServicePlanSku string = 'P1v3'

@description('Azure DocumentDB compute tier.')
@allowed([
  'M10'
  'M20'
  'M30'
  'M40'
  'M50'
  'M60'
  'M80'
])
param databaseSkuTier string = 'M10'

@description('Whether the Azure DocumentDB cluster runs a high-availability pair. Production uses a zone-redundant pair.')
@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundantPreferred'
])
param databaseHighAvailability string = 'Disabled'

@description('Image tag to deploy. The release workflow passes the commit SHA; the default suits a first manual apply.')
param imageTag string = 'latest'

@description('Non-secret backend settings, merged over the module defaults. Secrets come in as Key Vault references.')
param serverSettings object = {}

@description('Non-secret frontend settings, merged over the module defaults.')
param uiSettings object = {}

@description('Whether the API staging slot gets its own private endpoint. See the note in the module.')
param provisionApiSlotEndpoint bool = false

@description('Tags applied to every resource.')
param tags object = {}

var suffix = '${namePrefix}-${environmentName}'
var commonTags = union(tags, {
  application: 'book-space'
  environment: environmentName
  'managed-by': 'bicep'
})

// --- Names. Kept as variables so the params files do not have to repeat a naming convention,
// and so a rename is one edit. Storage-account-style names (ACR) must be globally unique and
// lowercase with no hyphens, hence the separate `replace`.
var vnetName = 'vnet-${suffix}'
var planName = 'plan-${suffix}'
var apiAppName = 'app-${suffix}-api'
var uiAppName = 'app-${suffix}-ui'
var clusterName = 'mongo-${suffix}'
var acrName = replace('acr${namePrefix}${environmentName}', '-', '')
var acrPullIdentityName = 'id-${suffix}-acr'
var githubIdentityName = 'id-${suffix}-github'

var integrationSubnetName = 'snet-fe-integration'
var frontendStagingIntegrationSubnetName = 'snet-fe-staging-integration'
var backendIntegrationSubnetName = 'snet-be-integration'
var backendStagingIntegrationSubnetName = 'snet-be-staging-integration'
var backendPeSubnetName = 'snet-pe-backend'
var databasePeSubnetName = 'snet-pe-database'

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    vnetName: vnetName
    integrationSubnetName: integrationSubnetName
    frontendStagingIntegrationSubnetName: frontendStagingIntegrationSubnetName
    backendIntegrationSubnetName: backendIntegrationSubnetName
    backendStagingIntegrationSubnetName: backendStagingIntegrationSubnetName
    backendPeSubnetName: backendPeSubnetName
    databasePeSubnetName: databasePeSubnetName
    tags: commonTags
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    acrName: acrName
    tags: commonTags
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    acrPullIdentityName: acrPullIdentityName
    githubIdentityName: githubIdentityName
    acrId: acr.outputs.acrId
    githubOwner: githubOwner
    githubRepo: githubRepo
    githubEnvironment: githubEnvironment
    subscriptionId: subscription().subscriptionId
    resourceGroupName: resourceGroup().name
    tags: commonTags
  }
}

module documentdb 'modules/documentdb.bicep' = {
  name: 'documentdb'
  params: {
    location: location
    clusterName: clusterName
    administratorLogin: databaseAdministratorLogin
    administratorPassword: databaseAdministratorPassword
    skuTier: databaseSkuTier
    highAvailabilityMode: databaseHighAvailability
    tags: commonTags
  }
}

module appService 'modules/app-service.bicep' = {
  name: 'app-service'
  params: {
    location: location
    planName: planName
    apiAppName: apiAppName
    uiAppName: uiAppName
    planSku: appServicePlanSku
    acrLoginServer: acr.outputs.acrLoginServer
    // The identity must exist before the app is created with `acrUseManagedIdentityCreds`, or
    // the pull is attempted with a principal Azure has not seen.
    acrPullIdentityId: identity.outputs.acrPullIdentityId
    imageTag: imageTag
    frontendIntegrationSubnetId: network.outputs.integrationSubnetId
    frontendStagingIntegrationSubnetId: network.outputs.frontendStagingIntegrationSubnetId
    backendIntegrationSubnetId: network.outputs.backendIntegrationSubnetId
    backendStagingIntegrationSubnetId: network.outputs.backendStagingIntegrationSubnetId
    apiHostName: '${apiAppName}.azurewebsites.net'
    customDomain: customDomain
    serverSettings: serverSettings
    uiSettings: uiSettings
    tags: commonTags
  }
}

// The backend's private endpoint. `groupId: 'sites'` with the App Service DNS zone: this is what
// makes the backend's host name resolve to a private address for a caller inside the VNet, while
// public network access stays disabled (FR-008).
module apiEndpoint 'modules/private-endpoint.bicep' = {
  name: 'private-endpoint-api'
  params: {
    location: location
    endpointName: 'pe-${suffix}-api'
    targetResourceId: appService.outputs.apiAppId
    groupId: 'sites'
    subnetId: network.outputs.backendPeSubnetId
    dnsZoneId: network.outputs.webDnsZoneId
    tags: commonTags
  }
}

// The database's private endpoint. `groupId: 'MongoCluster'` with the DocumentDB DNS zone; this
// is what lets the backend reach the cluster it can no longer reach publicly (FR-002a).
module databaseEndpoint 'modules/private-endpoint.bicep' = {
  name: 'private-endpoint-database'
  params: {
    location: location
    endpointName: 'pe-${suffix}-mongo'
    targetResourceId: documentdb.outputs.clusterId
    groupId: 'MongoCluster'
    subnetId: network.outputs.databasePeSubnetId
    dnsZoneId: network.outputs.mongoDnsZoneId
    tags: commonTags
  }
}

// The API staging slot is private too, so it needs its own private endpoint — a slot cannot share
// the production app's. It is off by default because the release flow (`release.yml`) deploys to
// the slot, swaps, and smoke-tests production through the frontend (plan § D7), which needs no
// slot endpoint. An operator who wants to test the slot *before* the swap turns this on; the
// second endpoint then consumes another address in the backend PE subnet.
module apiSlotEndpoint 'modules/private-endpoint.bicep' = if (provisionApiSlotEndpoint) {
  name: 'private-endpoint-api-slot'
  params: {
    location: location
    endpointName: 'pe-${suffix}-api-staging'
    targetResourceId: appService.outputs.apiSlotId
    groupId: 'sites'
    subnetId: network.outputs.backendPeSubnetId
    dnsZoneId: network.outputs.webDnsZoneId
    tags: commonTags
  }
}

output acrLoginServer string = acr.outputs.acrLoginServer
output acrName string = acr.outputs.acrName
output apiAppName string = appService.outputs.apiAppName
output apiDefaultHostName string = appService.outputs.apiDefaultHostName
output uiAppName string = appService.outputs.uiAppName
output uiDefaultHostName string = appService.outputs.uiDefaultHostName
output databaseClusterName string = documentdb.outputs.clusterName
output databaseConnectionString string = documentdb.outputs.connectionString
output githubIdentityClientId string = identity.outputs.githubIdentityClientId
output tenantId string = identity.outputs.tenantId
output backendPrivateIp string = apiEndpoint.outputs.endpointPrivateIp
output databasePrivateIp string = databaseEndpoint.outputs.endpointPrivateIp
