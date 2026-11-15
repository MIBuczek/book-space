// One private endpoint (003 T112, FR-008/FR-002a, contracts/network.md § 1).
//
// The module creates a **single** endpoint rather than a fixed pair. The backend needs one, the
// database needs one, and the backend's staging slot needs a third of its own (a slot cannot
// share the production app's endpoint), so a "two at a time" module could not express the slot
// case without also creating an endpoint nothing uses. `main.bicep` calls this once per endpoint.
//
// The `groupId` (the sub-resource the endpoint targets) and the DNS zone are paired, and a wrong
// pairing is the classic failure: the endpoint is created, the connection is approved, and the
// name still resolves publicly because the record went into a zone nothing queries. The valid
// pairs are:
//
//   Microsoft.Web/sites                -> `sites`         -> privatelink.azurewebsites.net
//   Microsoft.DocumentDB/mongoClusters -> `MongoCluster`  -> privatelink.mongocluster.cosmos.azure.com
//
// The zone **group** is a child resource of the endpoint (not a property of it), and it is what
// creates the `A` record. Without it the endpoint exists but nothing resolves to it.

@description('Region for the private endpoint.')
param location string

@description('Name of the private endpoint.')
param endpointName string

@description('Resource id of the resource this endpoint targets (an App Service or the DocumentDB cluster).')
param targetResourceId string

@description('The sub-resource of the target: `sites` for an App Service, `MongoCluster` for DocumentDB.')
@allowed([
  'sites'
  'MongoCluster'
])
param groupId string

@description('Resource id of the subnet this endpoint uses. Must be a dedicated private-endpoint subnet.')
param subnetId string

@description('Resource id of the private DNS zone the endpoint registers its address in.')
param dnsZoneId string

@description('Tags applied to the private endpoint.')
param tags object = {}

resource endpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: endpointName
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${endpointName}-connection'
        properties: {
          privateLinkServiceId: targetResourceId
          groupIds: [
            groupId
          ]
        }
      }
    ]
  }
}

resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: endpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: groupId
        properties: {
          privateDnsZoneId: dnsZoneId
        }
      }
    ]
  }
}

output endpointId string = endpoint.id
// The private address the DNS record resolves to. `customDnsConfigs` is populated once the zone
// group has created the record, so it is the value to read back when verifying SC-005.
output endpointPrivateIp string = endpoint.properties.customDnsConfigs[0].ipAddresses[0]
