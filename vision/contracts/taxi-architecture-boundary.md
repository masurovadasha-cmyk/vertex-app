# Vertex Taxi architecture boundary

This document records the architectural boundary between the standalone Vertex Taxi product and VERTEX Vision.

## Taxi owns
- ride state machine and trip lifecycle
- dispatch/matching and reservations
- H3/realtime driver location
- routing/ETA
- pricing
- payments and double-entry ledger
- safety and support private state
- Taxi PostgreSQL/PostGIS and Redis

## Vision may consume
- stable Taxi IDs
- explicitly permitted public ride status projections
- public ETA/driver references
- versioned /integration/v1 commands
- versioned Taxi domain events

## Vision must never access
- Taxi PostgreSQL/PostGIS directly
- Taxi Redis directly
- Taxi private schemas
- payment credentials
- private driver GPS history
- dispatch private state
- ledger private rows

## Required invariants
1. Taxi and Vision remain independently deployable.
2. Mutating integration commands require delegated identity and idempotency.
3. Events are at-least-once and consumers deduplicate by event_id.
4. Integration fails closed when service identity or Taxi Core is unavailable.
5. Cloudflare Service Binding is preferred for Worker-to-Worker communication.

The complete Taxi architecture pack is maintained in the separate Taxi project/repository; this Vision document intentionally contains only the boundary contract, not Taxi implementation code.