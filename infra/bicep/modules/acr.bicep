// The container registry (003 T110, contracts/deployment.md § 2).
//
// One registry, two image repositories (`book-space-server`, `book-space-ui`). The registry's
// admin account is **disabled**: the App Services pull with a managed identity (FR-006) and the
// release workflow pushes with its federated identity (FR-005), so the admin password is a
// credential with no consumer and one more thing to leak. The `AcrPull` grant for the app
// identities lives in `identity.bicep`, which owns every role assignment.
//
// `sku: Basic` is deliberate: the municipality's two images and low pull volume do not need
// geo-replication or private-link-only access. Raising it is a cost decision, not a correctness
// one.

@description('Region for the registry. Must match the apps\' region so pulls stay in-region.')
param location string

@description('Globally unique registry name: lowercase letters and digits only, 5-50 characters.')
@minLength(5)
@maxLength(50)
param acrName string

@description('Tags applied to the registry.')
param tags object = {}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    // The images are consumed by App Service, which authenticates with a managed identity, so
    // there is no reason to enable the shared admin account.
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: {
      // Keep a small, predictable set of untagged layers; the SHA tags are what is deployed and
      // they are never pruned by this policy.
      retentionPolicy: {
        days: 30
        status: 'enabled'
      }
    }
  }
}

output acrId string = acr.id
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
