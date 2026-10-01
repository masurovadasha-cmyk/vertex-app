# VERTEX TAXI — Architecture Foundation 1.0

This branch carries the Vertex Taxi architecture pack as a Git-tracked reference inside the connected Vertex repository until a dedicated GitHub repository can be created.

Vertex Taxi remains a separate product: separate backend, database, Redis, deployment and release cycle. VERTEX Vision consumes only the versioned integration contract.

## Foundation

- Modular monolith with hard bounded contexts.
- PostgreSQL + PostGIS is the source of truth.
- Redis is realtime/hot state only.
- H3 is used for geographic bucketing and supply/demand.
- Routing is behind an adapter.
- Ride lifecycle is a persisted finite state machine.
- Mutations require idempotency + optimistic concurrency.
- Dispatch reservations are protected by database invariants/locks.
- Transactional outbox is committed with business state.
- Redis Streams are used for durable event delivery.
- Money is integer minor units with an append-only double-entry ledger.
- Safety and audit data are append-only/immutable where appropriate.
- VERTEX Vision has no Taxi DB/Redis access.

## Golden flow

Quote → Request → Search → Dispatch → Accept → EnRoute → Arrive → PIN → Start → Complete → Payment → Ledger → Outbox → Integration Event

## Source archive

The complete local Git repository is also available in the conversation as `vertex-taxi-architecture-foundation-1.0.zip`.

Local architecture commit: `45312c1`.

This branch is intentionally not merged to VERTEX Vision production/master.
