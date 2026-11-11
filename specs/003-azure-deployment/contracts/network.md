# Contract: Private Network Topology

The contract for US3 — "the backend is internal, and only the frontend can call it". It fixes the
topology, the DNS, the subnets and the invariants, so the Bicep and the verification agree with it.

## 1. Topology

```text
                        ┌─────────────────────────── public internet ───────────────────────────┐
                        │                                                                        │
   user browser ────────┼──▶  FE App Service  (public inbound, the public surface)               │
                        │        │  serves the SPA, proxies /api                                     │
                        │        │                                                                  │
                        └────────┼──────────────────────────────────────────────────────────────────┘
                                 │  VNet integration (outbound)  ── subnet: snet-fe-integration
                                 ▼
                        private DNS zone: privatelink.azurewebsites.net
                                 │  resolves <api>.azurewebsites.net → private IP
                                 ▼
                        BE private endpoint  ── subnet: snet-pe-backend
                                 │
                                 ▼
                        BE App Service  (public network access DISABLED)
                                 │
                                 └──▶  Cosmos DB (see contracts/deployment.md)
```

| Element | Value (placeholder) | Rule |
|---------|--------------------|------|
| VNet | `vnet-book-space` | one, in the app's region |
| FE integration subnet | `snet-fe-integration` | delegated to `Microsoft.Web/serverFarms` |
| Backend PE subnet | `snet-pe-backend` | holds the private endpoint |
| Private DNS zone | `privatelink.azurewebsites.net` | linked to the VNet |
| Backend | `app-book-space-api` | `publicNetworkAccess: Disabled` |
| Frontend | `app-book-space-ui` | public inbound; VNet integration |

**The two subnets MUST differ.** VNet integration and a private endpoint cannot share a subnet
(Microsoft Learn, *Use Private Endpoints for Apps*).

## 2. Who may reach what

| Caller | Backend | Frontend |
|--------|---------|----------|
| Public internet (a user's browser) | **refused** (no public endpoint) | allowed (the SPA) |
| Frontend App Service (outbound) | allowed, over the private endpoint | n/a |
| A machine inside the VNet | allowed | allowed |
| A GitHub runner (public) | **refused** | allowed |

The browser **never** addresses the backend. It loads the SPA from the frontend and the SPA's
`/api` calls hit the frontend's own origin; nginx proxies them (FR-010).

## 3. DNS

- A private DNS zone `privatelink.azurewebsites.net` is linked to the VNet and holds an `A` record
  for the backend's host name pointing at the private IP.
- The private endpoint creates the record (or the zone is pre-created and the endpoint joins it).
- The frontend's VNet integration uses this zone; the public DNS still resolves the host name to
  the (now unreachable) public IP, which is why **public access must be disabled** — otherwise the
  public IP would still answer.

## 4. Invariants

1. **Backend public access is disabled.** Verified by SC-005: a request from the public internet
   does not reach the app.
2. **The frontend is the only caller.** Its VNet integration is the sole path in.
3. **The API's own guards are unchanged** (FR-011). The network control is additional; a request
   that reaches the API still faces `AuthGuard('jwt')` / `RolesGuard` / the public route's
   `OptionalJwtAuthGuard`.
4. **The whole topology is Bicep** (FR-012). No manual portal step: VNet, subnets, DNS zone, the
   endpoint and the access setting are all in `infra/bicep/`.
5. **The smoke test respects it** (plan § D7): it goes through the frontend, never a public API
   call.

## 5. Verification (SC-005)

```bash
# 1. From a public machine — must fail to connect (or answer 403 from the platform, never 200):
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings

# 2. Through the frontend — must return the twelve facilities:
curl -sS https://app-book-space-ui.azurewebsites.net/api/buildings | jq length

# 3. From inside the VNet (a jump box or a VNet-joined job) — must return 200:
curl -sS -o /dev/null -w '%{http_code}\n' https://app-book-space-api.azurewebsites.net/api/buildings
```

Check 1 is the acceptance test for US3; check 2 proves the chain works.
