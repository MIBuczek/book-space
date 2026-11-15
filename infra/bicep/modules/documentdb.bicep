// The Azure DocumentDB cluster (003 T115, research R1/R3, contracts/deployment.md § 5).
//
// Azure DocumentDB is the MongoDB-compatible vCore service, formerly "vCore-based Azure Cosmos DB
// for MongoDB". It is a **real MongoDB** (wire protocol 5.0-8.0), so the app's `DB_URI`, the
// Mongoose models and the `explain()`-based index assertions all carry over unchanged; the
// RU-based constraints (unique index only on an empty collection, a case-insensitive `$regex`
// scan) do not apply (research R2).
//
// The resource type is `Microsoft.DocumentDB/mongoClusters`, and it is a **different service**
// from the RU-based `Microsoft.DocumentDB/databaseAccounts` with `kind: MongoDB` — the two are
// not interchangeable, and writing the wrong one here would provision a cluster the driver's
// feature set does not match (decision 2).
//
// Public access is disabled: the cluster is reachable only through the private endpoint
// `private-endpoint.bicep` creates in the database subnet (FR-002a, research R3). The
// consequence is operational and deliberate — the migration and the backup tool need a
// VNet-joined context, not a workstation (research R11).
//
// The collections and indexes are **not** created here. They are created idempotently by
// `infra/scripts/ensure-collections.ts` (T116), which binds the server's own schemas, so the
// deployment cannot create an index set that disagrees with the API. Creating them in Bicep
// would be a second, drifting description of the same thing.

@description('Region for the cluster. Should match the apps\' region: network distance affects latency.')
param location string

@description('Name of the Azure DocumentDB cluster. Lowercase letters, digits and hyphens.')
param clusterName string

@description('Administrator login for the cluster.')
param administratorLogin string

@description('Administrator password. Supply through a parameter file from Key Vault, never inline.')
@secure()
param administratorPassword string

@description('Compute tier of the cluster. The smallest tier fits the municipality\'s volume.')
@allowed([
  'M10'
  'M20'
  'M30'
  'M40'
  'M50'
  'M60'
  'M80'
])
param skuTier string = 'M10'

@description('Whether the cluster runs a single node or a high-availability pair. Production uses HA.')
@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundantPreferred'
])
param highAvailabilityMode string = 'Disabled'

@description('MongoDB major version the cluster speaks.')
@allowed([
  '5.0'
  '6.0'
  '7.0'
  '8.0'
])
param mongoVersion string = '7.0'

@description('Whether public network access is enabled. Must stay Disabled: the cluster is private (FR-002a).')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Disabled'

@description('Tags applied to the cluster.')
param tags object = {}

resource cluster 'Microsoft.DocumentDB/mongoClusters@2024-10-01-preview' = {
  name: clusterName
  location: location
  tags: tags
  properties: {
    // The administrator credentials are one object. `password` is `@secure()`, so it is never
    // echoed in a deployment log and travels once, from the parameter file.
    administrator: {
      userName: administratorLogin
      password: administratorPassword
    }
    serverVersion: mongoVersion
    compute: {
      tier: skuTier
    }
    highAvailability: {
      targetMode: highAvailabilityMode
    }
    storage: {
      sizeGb: 32
    }
    // Public access off is the whole point of the module (FR-002a). The private endpoint in
    // `private-endpoint.bicep` is the only path in.
    publicNetworkAccess: publicNetworkAccess
  }
}

output clusterId string = cluster.id
output clusterName string = cluster.name
// The connection string the service exposes, including the `retrywrites=false` and
// `authMechanism=SCRAM-SHA-256` options the tier requires (contracts/deployment.md § 3). The
// operator splits the credentials out of it into the App Service setting; the value is read from
// the deployment output rather than hand-assembled, so a service-side change is picked up.
output connectionString string = cluster.properties.connectionString
