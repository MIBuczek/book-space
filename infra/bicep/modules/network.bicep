// The virtual network and the two private DNS zones (003 T111, contracts/network.md § 1).
//
// This module is the substrate the private topology stands on. It creates the VNet, three
// subnets and the two private DNS zones, and it is the module every other one depends on: a
// private endpoint needs a subnet, and it needs the matching DNS zone linked to the VNet or the
// name resolves publicly and the caller reaches nothing (the "works from the portal, not from
// the app" failure `contracts/network.md` § 3 names).
//
// Every subnet must differ. Azure forbids VNet integration and a private endpoint from sharing a
// subnet, each private endpoint needs its own, and a slot cannot reuse its app's integration
// subnet, so the split is:
//
//   snet-fe-integration          delegated to Microsoft.Web/serverFarms, the frontend's outbound path
//   snet-fe-staging-integration  the frontend's staging slot's outbound path
//   snet-be-integration          the backend's outbound path (it is the database's caller)
//   snet-be-staging-integration  the backend's staging slot's outbound path
//   snet-pe-backend              the backend App Service's private endpoint
//   snet-pe-database             the Azure DocumentDB cluster's private endpoint
//
// A wrong delegation on an integration subnet is rejected at deployment, which is the point of
// delegating it here rather than leaving it to the portal.
//
// **Why the backend needs an integration subnet too.** The backend is the database's actual
// caller, and the database is private, so the backend needs an outbound path to the database's
// private endpoint exactly as the frontend needs one to the backend's. `contracts/network.md`
// § 1 names only the frontend's integration subnet, but its own topology diagram draws
// `BE App Service ──▶ DocumentDB, over the private endpoint`, which cannot work without one.
//
// **Why the staging slots need their own.** A slot is a separate app: it starts its own
// container, and the API container connects to the database on boot, so the API slot needs an
// outbound path to the private database just as production does. A slot cannot share the
// production app's integration subnet, so each gets a dedicated one. `release.yml` deploys to
// these slots and warms them before the swap, which is what makes the swap instant and the
// rollback a single command (FR-015, SC-006).

@description('Region for the virtual network and the private DNS zone links. All resources sit in the app\'s region.')
param location string

@description('Name of the virtual network.')
param vnetName string

@description('Name of the frontend VNet-integration subnet.')
param integrationSubnetName string

@description('Name of the frontend staging-slot VNet-integration subnet.')
param frontendStagingIntegrationSubnetName string

@description('Name of the backend VNet-integration subnet.')
param backendIntegrationSubnetName string

@description('Name of the backend staging-slot VNet-integration subnet.')
param backendStagingIntegrationSubnetName string

@description('Name of the backend private-endpoint subnet.')
param backendPeSubnetName string

@description('Name of the database private-endpoint subnet.')
param databasePeSubnetName string

@description('Address space of the virtual network, as CIDR blocks.')
param vnetAddressPrefixes array = ['10.20.0.0/16']

@description('CIDR of the frontend VNet-integration subnet.')
param integrationSubnetPrefix string = '10.20.0.0/24'

@description('CIDR of the frontend staging-slot VNet-integration subnet.')
param frontendStagingIntegrationSubnetPrefix string = '10.20.1.0/24'

@description('CIDR of the backend VNet-integration subnet.')
param backendIntegrationSubnetPrefix string = '10.20.2.0/24'

@description('CIDR of the backend staging-slot VNet-integration subnet.')
param backendStagingIntegrationSubnetPrefix string = '10.20.3.0/24'

@description('CIDR of the backend private-endpoint subnet.')
param backendPeSubnetPrefix string = '10.20.4.0/24'

@description('CIDR of the database private-endpoint subnet.')
param databasePeSubnetPrefix string = '10.20.5.0/24'

@description('Tags applied to every resource this module creates.')
param tags object = {}

// The App Service DNS zone. A private endpoint for `Microsoft.Web/sites` registers its address
// here, so the frontend's VNet integration resolves the backend host name to the private IP.
var webDnsZoneName = 'privatelink.azurewebsites.net'

// The Azure DocumentDB DNS zone. `privatelink.mongocluster.cosmos.azure.com` is the zone the
// service's own private endpoint uses; a typo here is the single most likely cause of a database
// that is private on paper and unreachable in practice.
var mongoDnsZoneName = 'privatelink.mongocluster.cosmos.azure.com'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: vnetAddressPrefixes
    }
  }
}

// The subnets are child resources of the VNet rather than a loop, because each carries a
// different purpose and one carries a delegation. A loop would have to encode the delegation in
// data and would hide which subnet is which.
resource integrationSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: integrationSubnetName
  properties: {
    addressPrefix: integrationSubnetPrefix
    // Delegating the subnet to the App Service plan is what allows VNet integration. Without
    // it the integration call is refused.
    delegations: [
      {
        name: 'web'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
  }
}

resource frontendStagingIntegrationSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: frontendStagingIntegrationSubnetName
  properties: {
    addressPrefix: frontendStagingIntegrationSubnetPrefix
    delegations: [
      {
        name: 'web'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
  }
}

resource backendIntegrationSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: backendIntegrationSubnetName
  properties: {
    addressPrefix: backendIntegrationSubnetPrefix
    delegations: [
      {
        name: 'web'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
  }
}

resource backendStagingIntegrationSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: backendStagingIntegrationSubnetName
  properties: {
    addressPrefix: backendStagingIntegrationSubnetPrefix
    delegations: [
      {
        name: 'web'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
  }
}

resource backendPeSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: backendPeSubnetName
  properties: {
    addressPrefix: backendPeSubnetPrefix
  }
}

resource databasePeSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: databasePeSubnetName
  properties: {
    addressPrefix: databasePeSubnetPrefix
  }
}

// A private DNS zone is a global resource: its `location` is `global`, not the app's region.
resource webDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: webDnsZoneName
  location: 'global'
  tags: tags
}

resource mongoDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: mongoDnsZoneName
  location: 'global'
  tags: tags
}

// The links are what make the zones usable from this VNet. A zone with no link resolves nothing
// for the app, and the failure is silent at deploy time.
resource webDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: webDnsZone
  name: '${vnetName}-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource mongoDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: mongoDnsZone
  name: '${vnetName}-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

output vnetId string = vnet.id
output integrationSubnetId string = integrationSubnet.id
output frontendStagingIntegrationSubnetId string = frontendStagingIntegrationSubnet.id
output backendIntegrationSubnetId string = backendIntegrationSubnet.id
output backendStagingIntegrationSubnetId string = backendStagingIntegrationSubnet.id
output backendPeSubnetId string = backendPeSubnet.id
output databasePeSubnetId string = databasePeSubnet.id
output webDnsZoneId string = webDnsZone.id
output mongoDnsZoneId string = mongoDnsZone.id
