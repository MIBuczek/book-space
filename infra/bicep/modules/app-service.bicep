// The App Service plan and the two Linux container web apps (003 T113, FR-003/006/007/008/009/010/015/016).
//
// One plan, two apps, one staging slot each. The plan is `P1v3` (PremiumV3) because that is what
// the spec recommends for production: it gives deployment slots (FR-015, `Standard` or higher)
// and satisfies the private endpoint's `Basic`+ floor with margin.
//
// The two apps are deliberately **not** symmetric, and the asymmetry is the feature:
//
//   api  the backend. Public network access is **disabled** (FR-008); it is reachable only
//        through the private endpoint. It has its own VNet integration so it can reach the
//        private database.
//   ui   the frontend. Public inbound stays on (it is the public surface, FR-009), and it gets
//        VNet integration so its nginx proxy can reach the private backend. It is served on a
//        custom domain over TLS (FR-016).
//
// Both pull their image from ACR with the managed identity (FR-006); neither carries a registry
// password. Every environment-specific value is an app setting (FR-007) and none is baked into an
// image.
//
// **A slot is a separate app**, so it cannot share the production app's VNet integration subnet
// and it gets its own integration below. The backend's staging slot needs its own *private
// endpoint* too (endpoints cannot be shared), but that one is created at the top level
// (`private-endpoint.bicep`, keyed on the slot's resource id) and only when
// `provisionApiSlotEndpoint` is set: the release flow deploys to the slot and smoke-tests
// *production* through the frontend (plan § D7), so a slot endpoint is an operator choice, not a
// release requirement. The frontend's slot needs no private endpoint at all — the frontend is
// public on both slots.

@description('Region for the plan and the apps.')
param location string

@description('Name of the App Service plan.')
param planName string

@description('Name of the backend (API) web app.')
param apiAppName string

@description('Name of the frontend (UI) web app.')
param uiAppName string

@description('App Service plan SKU. Must be Standard or higher for slots (FR-015).')
@allowed([
  'P0v3'
  'P1v3'
  'P2v3'
  'P3v3'
])
param planSku string = 'P1v3'

@description('Login server of the container registry, e.g. `bookspace.azurecr.io`.')
param acrLoginServer string

@description('Resource id of the managed identity that pulls from ACR (FR-006).')
param acrPullIdentityId string

@description('Image repository name for the backend.')
param serverImageRepository string = 'book-space-server'

@description('Image repository name for the frontend.')
param uiImageRepository string = 'book-space-ui'

@description('Image tag to deploy. The release workflow passes the commit SHA.')
param imageTag string = 'latest'

@description('Resource id of the subnet the frontend VNet integration uses.')
param frontendIntegrationSubnetId string

@description('Resource id of the subnet the frontend staging slot VNet integration uses.')
param frontendStagingIntegrationSubnetId string

@description('Resource id of the subnet the backend VNet integration uses.')
param backendIntegrationSubnetId string

@description('Resource id of the subnet the backend staging slot VNet integration uses.')
param backendStagingIntegrationSubnetId string

@description('The backend\'s host name, which the frontend nginx proxy targets (`API_UPSTREAM`).')
param apiHostName string

@description('Custom domain the frontend is served on, without a scheme. Empty disables the custom domain.')
param customDomain string = ''

@description('Backend app settings. Values are non-secret; secrets come in through Key Vault references.')
param serverSettings object = {}

@description('Frontend app settings beyond `API_UPSTREAM`.')
param uiSettings object = {}

@description('Tags applied to every resource this module creates.')
param tags object = {}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: planSku
  }
  kind: 'linux'
  properties: {
    // Reserved must be true for a Linux plan; without it the plan is created as Windows and the
    // container app is rejected.
    reserved: true
  }
}

// A site's app settings are a map of string -> string. The base settings are the ones that make
// the container pull work; the caller's `serverSettings`/`uiSettings` are merged on top, so an
// operator adds `JWT_SECRET` (a Key Vault reference) without editing this module.
//
// The image is named **once**, in `siteConfig.linuxFxVersion` below — a Linux container app reads
// its image from there — and the release updates it with `az webapp config container set`. There
// is deliberately no `DOCKER_CUSTOM_IMAGE_NAME` here: naming the image twice invites the two to
// drift, and a slot swap then promotes whichever one App Service happened to prefer.
var baseServerSettings = {
  WEBSITES_PORT: '3000'
  DOCKER_REGISTRY_SERVER_URL: 'https://${acrLoginServer}'
}

var baseUiSettings = {
  WEBSITES_PORT: '80'
  DOCKER_REGISTRY_SERVER_URL: 'https://${acrLoginServer}'
  // The frontend's nginx proxy target: the backend's private host name, resolved through the
  // private DNS zone. The UI issues relative `/api` requests, so no CORS is needed (FR-010).
  API_UPSTREAM: 'https://${apiHostName}'
}

// The backend app. Public inbound off (FR-008); reachable only through its private endpoint.
resource apiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: apiAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    // `publicNetworkAccess: 'Disabled'` is the network control; the private endpoint is the only
    // path in. The API's own guards are unchanged and remain the enforcement (FR-011).
    publicNetworkAccess: 'Disabled'
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/${serverImageRepository}:${imageTag}'
      // The managed identity is what the ACR pull authenticates with.
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: acrPullIdentityId
      alwaysOn: true
      ftpsState: 'Disabled'
    }
  }
}

// App settings are their own child resource (`appsettings`), not part of `siteConfig`. This is
// the canonical shape and it lets the two maps be merged with `union`, where the caller's
// settings win — so an operator adds or overrides a value without editing this module.
resource apiSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: apiApp
  name: 'appsettings'
  properties: union(baseServerSettings, serverSettings)
}

// The frontend app. Public inbound on (it is the public surface), VNet integration for outbound.
resource uiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: uiAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    publicNetworkAccess: 'Enabled'
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/${uiImageRepository}:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: acrPullIdentityId
      alwaysOn: true
      ftpsState: 'Disabled'
    }
  }
}

resource uiSettingsResource 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: uiApp
  name: 'appsettings'
  properties: union(baseUiSettings, uiSettings)
}

// VNet integration is a child resource of the site, and it is what gives each app an outbound
// path. The frontend reaches the backend's private endpoint; the backend reaches the database's.
resource uiIntegration 'Microsoft.Web/sites/networkConfig@2023-12-01' = {
  parent: uiApp
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: frontendIntegrationSubnetId
  }
}

resource apiIntegration 'Microsoft.Web/sites/networkConfig@2023-12-01' = {
  parent: apiApp
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: backendIntegrationSubnetId
  }
}

// The staging slots integrate on their own subnets. A slot is a separate app that starts its own
// container, and the API container connects to the private database on boot, so without these the
// slot never becomes healthy and `release.yml`'s warm-up would time out before the swap.
resource uiSlotIntegration 'Microsoft.Web/sites/slots/networkConfig@2023-12-01' = {
  parent: uiSlot
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: frontendStagingIntegrationSubnetId
  }
}

resource apiSlotIntegration 'Microsoft.Web/sites/slots/networkConfig@2023-12-01' = {
  parent: apiSlot
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: backendStagingIntegrationSubnetId
  }
}

// The custom domain (FR-016). An empty `customDomain` skips the binding, which is what a
// non-production environment without DNS control wants.
resource customDomainBinding 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = if (customDomain != '') {
  parent: uiApp
  name: customDomain
  properties: {
    siteName: uiApp.name
    customHostNameDnsRecordType: 'CName'
    hostNameType: 'Verified'
  }
}

// The staging slot on each app (FR-015). The slot inherits the app's settings; the release
// workflow deploys the new image here, smoke-tests, then swaps.
resource apiSlot 'Microsoft.Web/sites/slots@2023-12-01' = {
  parent: apiApp
  name: 'staging'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    publicNetworkAccess: 'Disabled'
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/${serverImageRepository}:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: acrPullIdentityId
      alwaysOn: true
      ftpsState: 'Disabled'
    }
  }
}

resource apiSlotSettings 'Microsoft.Web/sites/slots/config@2023-12-01' = {
  parent: apiSlot
  name: 'appsettings'
  properties: union(baseServerSettings, serverSettings)
}

resource uiSlot 'Microsoft.Web/sites/slots@2023-12-01' = {
  parent: uiApp
  name: 'staging'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    publicNetworkAccess: 'Enabled'
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/${uiImageRepository}:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: acrPullIdentityId
      alwaysOn: true
      ftpsState: 'Disabled'
    }
  }
}

resource uiSlotSettings 'Microsoft.Web/sites/slots/config@2023-12-01' = {
  parent: uiSlot
  name: 'appsettings'
  properties: union(baseUiSettings, uiSettings)
}

output apiAppId string = apiApp.id
output apiAppName string = apiApp.name
output apiDefaultHostName string = apiApp.properties.defaultHostName
output apiSlotId string = apiSlot.id
output uiAppId string = uiApp.id
output uiAppName string = uiApp.name
output uiDefaultHostName string = uiApp.properties.defaultHostName
output uiSlotId string = uiSlot.id
output planId string = plan.id
