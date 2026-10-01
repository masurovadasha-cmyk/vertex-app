# Vertex Taxi integration

Vertex Taxi remains a separate product with its own repository, database, deployment and release cycle.

## VISION boundary

VISION does **not** read or write Taxi private tables. Integration is limited to:
- the versioned `/integration/v1` API;
- delegated VISION identity/tenant/organization context;
- ECDSA P-256 service proof for server-to-server calls;
- versioned Taxi domain events;
- stable public references only.

The browser may open the standalone Taxi application, but never receives Taxi database credentials.

## Staging gateway

VISION staging exposes `/api/taxi/*` routes. The gateway:
1. verifies the Supabase-authenticated VISION user;
2. verifies an active VISION membership for the requested tenant/organization;
3. ignores spoofed client user-id headers and derives user id from Auth;
4. requires idempotency keys for mutations;
5. signs the delegated request with P-256;
6. uses a same-account Service Binding when configured, otherwise an HTTPS staging origin;
7. fails closed when transport or signing material is missing.

Taxi remains source of truth.

## Event return path

Master already contains the generic durable `vision_event_inbox` foundation (migration 0011).
Taxi event consumers must use that shared at-least-once/deduplicated boundary rather than introducing a second inbox implementation. A Taxi public projection may store only bounded lifecycle/reference fields, never GPS history, dispatch internals, payment credentials or Taxi ledger data.

## Data boundary

VERTEX VISION
  identity / organizations / permissions / generic event inbox
             |
             | signed /integration/v1
             | public domain events
             v
VERTEX TAXI CORE
  rides / drivers / vehicles / dispatch / pricing
  payments / ledger / safety / realtime geo

NO shared database
NO shared private schema
NO direct SQL

Production binding remains gated by real staging E2E and owner approval.
