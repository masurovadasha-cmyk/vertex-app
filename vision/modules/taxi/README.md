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

The integration branch is contract-ready and declares the staging Service Binding target `vertex-taxi-core-staging`. Deployment remains gated until that standalone Taxi Core Worker exists and the delegated identity contract is verified.

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
2. Verify JWT/service identity, active VISION tenant/organization membership, and Taxi-side authorization.
3. Add VERTEX_TAXI_CORE Service Binding to VISION staging.
4. Run integration contract tests.
5. Enable Taxi navigation in VISION.
6. Only after staging approval consider production binding.
