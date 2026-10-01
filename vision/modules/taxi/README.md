# Vertex Taxi integration

Vertex Taxi is a separate product and keeps its own repository, database, deployment and release cycle.

## VISION boundary

VISION does **not** read or write Taxi tables. The integration surface is:

- /integration/v1 API contract
- versioned Taxi domain events
- explicit VISION permissions
- stable tenant/organization/user identifiers
- optional Cloudflare Service Binding between the VISION Worker and Taxi Core Worker

The browser module opens the standalone Vertex Taxi application. It never receives Taxi database credentials and never calls PostgreSQL/Redis directly.

## Staging state

The integration is contract-ready. A real Taxi Core Worker binding is not declared in VISION until the Taxi staging Worker has a stable deployed name and verified authentication contract.

When both Workers are deployed in the same Cloudflare account, prefer a Service Binding over a public HTTP hop for server-to-server calls.

## Data boundary

VERTEX VISION
  identity / organization / permissions
             |
             | /integration/v1
             | domain events
             v
VERTEX TAXI CORE
  rides / drivers / vehicles / dispatch / pricing
  payments / ledger / safety / realtime geo

NO shared database
NO shared private schema
NO direct SQL

## Future integration sequence

1. Deploy Taxi Core staging.
2. Verify JWT/service identity and tenant mapping.
3. Add VERTEX_TAXI_CORE Service Binding to VISION staging.
4. Run integration contract tests.
5. Enable Taxi navigation in VISION.
6. Only after staging approval consider production binding.


## Reconciled master gateway

The master integration layer now contains a staging-capable server gateway without
moving Taxi private state into VISION. Authenticated VISION users may be delegated
only when the existing server-authoritative session-scope RPC confirms an active
member scope for the requested tenant and organization.

Gateway routes:
- `GET /api/taxi/capabilities`
- `GET /api/taxi/health`
- `GET /api/taxi/rides/{ride_id}`
- `POST /api/taxi/rides`
- `POST /api/taxi/rides/{ride_id}/commands`

Mutations require an idempotency key. The forwarded `x-vertex-user-id` is always
derived from the verified Supabase identity; a browser-supplied user id is ignored.

Transport is fail-closed. A future staging environment may provide either an
optional Cloudflare Service Binding named `VERTEX_TAXI_CORE` or an explicitly
configured authenticated HTTP fallback. Neither is required by the default VISION
deployment, so Views staging remains independently deployable.

The existing generic VISION event inbox remains the canonical durability boundary
for future Taxi event consumption. The older parallel Taxi-specific inbox schema
from experimental PRs is intentionally not duplicated in master.
