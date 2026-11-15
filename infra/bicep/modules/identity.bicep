// Identities and role assignments (003 T114, FR-005/FR-006, research R5/R6).
//
// Two identities, with different jobs:
//
//   acrPullIdentity   attached to both App Services; holds `AcrPull` on the registry so a pull
//                     needs no registry password in a workflow (FR-006, R6).
//   githubIdentity    a user-assigned identity with a **federated credential** trusting this
//                     repository's GitHub OIDC token. `azure/login` in the release workflow
//                     exchanges the token for a short-lived Azure token, so no Azure client
//                     secret is stored anywhere (FR-005, R5).
//
// The federated credential's `subject` is the security-relevant value: it is the exact
// `repo:<owner>/<repo>:<environment>` (or `:ref:refs/heads/main`) claim GitHub will present.
// Pinning it to a single environment means a workflow in a fork, or on a different branch, cannot
// mint a token for this identity even though it holds a valid OIDC issuer token. Do not widen it
// to `repo:<owner>/<repo>:*` — that would let any branch in the repository deploy.
//
// The role assignments use the well-known role definition GUIDs rather than a name lookup, so a
// deployment needs no read of the role definitions and a localised Azure would still resolve
// them. `AcrPull` is `7f951dda-4ed3-4680-a7ca-43fe172d538d`; `Contributor` on the resource group
// is `b24988ac-6180-42a0-ab88-20f7382dd24c`.

@description('Region for the user-assigned identities (they are regional resources).')
param location string

@description('Name of the identity the App Services use to pull from ACR.')
param acrPullIdentityName string

@description('Name of the identity GitHub Actions federates to.')
param githubIdentityName string

@description('Resource id of the container registry the identity may pull from.')
param acrId string

@description('GitHub organisation or user that owns the repository.')
param githubOwner string

@description('GitHub repository name (without the owner).')
param githubRepo string

@description('The GitHub environment the release workflow uses. The federated credential is pinned to it.')
param githubEnvironment string = 'production'

@description('Subscription id the GitHub identity may deploy into.')
param subscriptionId string

@description('Resource group the GitHub identity may deploy into.')
param resourceGroupName string

@description('Tags applied to every resource this module creates.')
param tags object = {}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
// Contributor scoped to the resource group, not the subscription: the release workflow updates
// App Service settings and slots, which needs write on those resources and nothing wider.
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource acrPullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: acrPullIdentityName
  location: location
  tags: tags
}

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: githubIdentityName
  location: location
  tags: tags
}

// The role assignment's name is its GUID; deriving it from the scope, principal and role keeps
// it stable across redeployments, so a re-run updates rather than duplicates.
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, acrPullIdentity.id, acrPullRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: acrPullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// The GitHub identity needs to update the App Services (image, settings) and to swap slots.
// Contributor on the resource group is the narrowest built-in role that covers both.
resource contributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, githubIdentity.id, contributorRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// The federated credential. `issuer` is GitHub's fixed OIDC issuer and `audience` is the fixed
// `api://AzureADTokenExchange`; only `subject` varies, and it is the value that scopes the trust.
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-${githubEnvironment}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    // The property is a list even though exactly one audience is valid; the schema requires it.
    audiences: [
      'api://AzureADTokenExchange'
    ]
    subject: 'repo:${githubOwner}/${githubRepo}:environment:${githubEnvironment}'
  }
}

output acrPullIdentityId string = acrPullIdentity.id
output acrPullIdentityClientId string = acrPullIdentity.properties.clientId
output acrPullIdentityPrincipalId string = acrPullIdentity.properties.principalId
output githubIdentityId string = githubIdentity.id
output githubIdentityClientId string = githubIdentity.properties.clientId
output githubIdentityPrincipalId string = githubIdentity.properties.principalId
output tenantId string = tenant().tenantId
output subscriptionId string = subscriptionId
output resourceGroupName string = resourceGroupName
