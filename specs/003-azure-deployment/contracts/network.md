# Contract: Private Network Topology

The contract for US3 — "the backend is internal, and only the frontend can call it". It fixes the
topology, the DNS, the subnets and the invariants, so the Bicep and the verification agree with it.

## 1. Topology

```text
                        ┌─────────────────────────── public internet ───────────────────────────┐
                        │                                                                        │
   user browser ────────┼──▶  FE App Service  (public inbound, custom domain, the public surface)│
                        │        │  serves the SPA, proxies /api                                     │
                        │        │                                                                  │
                        └────────┼──────────────────────────────────────────────────────────────────┘
                                 │  VNet integration (outbound)  ── subnet: snet-fe-integration
                                 ▼
                        private DNS zones (linked to the VNet)
                          ├─ privatelink.azurewebsites.net              → BE private endpoint
                          └─ privatelink.mongocluster.cosmos.azure.com  → DB private endpoint
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                      ▼
   BE private endpoint                     DB private endpoint
   ── subnet: snet-pe-backend              ── subnet: snet-pe-database
              │                                      │
              ▼                                      ▼
   BE App Service                          Azure DocumentDB
   (public access DISABLED)                (public access DISABLED)
              │
              └───────────▶  DocumentDB, over the private endpoint
```

| Element | Value (placeholder) | Rule |
|---------|--------------------|------|
| VNet | `vnet-book-space` | one, in the app's region (default Poland Central) |
| FE integration subnet | `snet-fe-integration` | delegated to `Microsoft.Web/serverFarms` |
| Backend PE subnet | `snet-pe-backend` | holds the backend's private endpoint |
| Database PE subnet | `snet-pe-database` | holds the database's private endpoint |
| Backend DNS zone | `privatelink.azurewebsites.net` | linked to the VNet |
| Database DNS zone | `privatelink.mongocluster.cosmos.azure.com` | linked to the VNet |
| Backend | `app-book-space-api` | `publicNetworkAccess: Disabled` |
| Database | `mongo-book-space` (`Microsoft.DocumentDB/mongoClusters`) | public access disabled |
| Frontend | `app-book-space-ui` | public inbound on the custom domain; VNet integration |

**The subnets MUST differ.** VNet integration and a private endpoint cannot share a subnet, and
each private endpoint needs its own (Microsoft Learn, *Use Private Endpoints for Apps*).

## 2. Who may reach what

| Caller | Backend | Database | Frontend |
|--------|---------|----------|----------|
| Public internet (a user's browser) | **refused** (no public endpoint) | **refused** | allowed (the SPA) |
| Frontend App Service (outbound) | allowed, over the private endpoint | allowed, over the private endpoint | n/a |
| A machine inside the VNet | allowed | allowed | allowed |
| A GitHub runner (public) | **refused** | **refused** | allowed |

The browser **never** addresses the backend. It loads the SPA from the frontend and the SPA's
`/api` calls hit the frontend's own origin; nginx proxies them (FR-010).

## 3. DNS

- Two private DNS zones are linked to the VNet: `privatelink.azurewebsites.net` (the backend) and
  `privatelink.mongocluster.cosmos.azure.com` (the database).
- Each private endpoint creates its own `A` record (or the zone is pre-created and the endpoint
  joins it).
- The frontend's VNet integration uses both zones; the public DNS still resolves the host names to
  the (now unreachable) public IPs, which is why **public access must be disabled** on both —
  otherwise the public IP would still answer.

## 4. Invariants

1. **Backend and database public access are disabled.** Verified by SC-005: a request from the
   public internet reaches neither.
2. **The frontend is the only caller.** Its VNet integration is the sole path in.
3. **The API's own guards are unchanged** (FR-011). The network control is additional; a request
   that reaches the API still faces `AuthGuard('jwt')` / `RolesGuard` / the public route's
   `OptionalJwtAuthGuard`.
4. **The whole topology is Bicep** (FR-012). No manual portal step: VNet, subnets, both DNS zones,
   both endpoints and the access settings are all in `infra/bicep/`.
5. **The smoke test respects it** (plan § D7): it goes through the frontend, never a public API
   call.

## 5. Verification (SC-005)

```bash
# 1. From a public machine — must fail to connect (or answer 403 from the platform, never 200):
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings

# 2. Through the frontend (custom domain) — must return the twelve facilities:
curl -sS https://<custom-domain>/api/buildings | jq length

# 3. From inside the VNet (a jump box or a VNet-joined job) — must return 200:
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings

# 4. The database from a public machine — must fail to connect (it has no public endpoint):
mongosh "$DB_URI" --eval 'db.runCommand({ping:1})'   # expect a connection failure outside the VNet
```

Check 1 is the acceptance test for US3; check 2 proves the chain works; check 4 proves the
database is private too.
