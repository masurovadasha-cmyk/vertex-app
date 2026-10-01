# VERTEX Vision integration boundary

Taxi is a separate product. Vision is a consumer/integrator, not a database peer.

```text
VERTEX VISION
  identity / org / permissions
          |
          | Service Binding / /integration/v1
          v
VERTEX TAXI CORE
  rides / drivers / vehicles / pricing / dispatch / safety / ledger
```

Rules:

- no shared database;
- no direct SQL from Vision;
- no Taxi Redis credentials in Vision;
- Vision may store references such as `taxi_ride_id`, not Taxi private state;
- mutations require delegated identity + idempotency;
- event consumers deduplicate by `event_id`;
- timeout/failure is fail-closed for commands;
- Service Binding is preferred for Cloudflare Worker-to-Worker calls.

Required integration headers/identity claims: `authorization`, `x-vertex-tenant-id`, `x-vertex-organization-id`, `x-vertex-correlation-id`.
