# Vertex Taxi Marketplace Foundation 0.2

Status: proposed for staging implementation. This document is architecture/contract only; Taxi Core implementation remains outside VERTEX Vision and outside the vertex-app runtime.

## Goals

- Keep current client/driver flows backward compatible.
- Add scalable marketplace primitives before dynamic pricing/ML.
- Separate durable ride state from high-frequency presence/location.
- Prevent double-assignment, duplicate commands, stale GPS dispatch and silent event loss.
- Preserve Taxi Core as source of truth and VISION as an external consumer.

## Bounded contexts

1. identity
2. riders
3. drivers
4. driver-presence
5. vehicles/fleet
6. geo
7. location-ingestion
8. routing/eta
9. quotes/pricing
10. marketplace supply/demand
11. dispatch
12. offers/leases
13. rides/trips
14. cancellations/progress
15. realtime
16. notifications
17. payments/ledger
18. safety/fraud
19. support
20. audit/events
21. feature-flags/experiments
22. observability

## Durable state vs realtime state

Durable PostgreSQL:
- accounts, roles, driver verification
- quotes
- rides/trips
- driver offers
- cancellation decisions
- payments/ledger
- audit/outbox

Realtime plane:
- driver online/available/reserved/on_trip presence
- latest location
- heartbeat freshness
- H3 cell membership
- transient dispatch candidate sets
- websocket subscriptions

Staging may initially use PostgreSQL for the realtime tables while preserving the interface boundary so Redis/Valkey can replace the storage without changing the domain API.

## New tables

### taxi_driver_presence
- driver_id uuid PK
- status enum: OFFLINE | ONLINE | AVAILABLE | RESERVED | ON_TRIP
- last_heartbeat_at timestamptz
- last_location_at timestamptz
- location_freshness enum: FRESH | DEGRADED | STALE | OFFLINE
- h3_cell text
- latitude double precision
- longitude double precision
- heading double precision
- speed_mps double precision
- accuracy_m double precision
- version bigint
- updated_at timestamptz

Indexes:
- (status, location_freshness)
- (h3_cell, status)
- partial available+fresh index

### taxi_quotes
- id uuid PK
- rider_user_id bigint
- pickup/destination labels + coordinates
- service_class_id text
- base_fare_minor
- distance_fare_minor
- time_fare_minor
- surge_minor
- fees_minor
- discount_minor
- total_minor
- currency
- pricing_version
- valid_until
- created_at

Quotes are immutable.

### taxi_driver_offers
- id uuid PK
- ride_id uuid
- driver_id uuid
- lease_token uuid UNIQUE
- state enum: OFFERED | ACCEPTED | DECLINED | EXPIRED | CANCELLED
- expires_at
- offered_at
- accepted_at
- version bigint

Rules:
- one active offer per driver
- one active accepted offer per ride
- accept is compare-and-set on state+version+expiry
- expired offers cannot be accepted

### taxi_dispatch_attempts
- id uuid PK
- ride_id uuid
- attempt_no integer
- candidate_count integer
- selected_driver_id uuid nullable
- outcome text
- started_at
- completed_at
- trace_id uuid
- metadata jsonb

### taxi_progress_snapshots
- id bigserial PK
- ride_id uuid
- driver_id uuid
- driver_lat/lng
- eta_seconds
- distance_meters
- state
- captured_at

Used for DRIVER_NOT_PROGRESSING detection.

### taxi_feature_flags
- key text PK
- enabled boolean
- rollout_percent integer
- config jsonb
- updated_at
- updated_by

## Expanded ride state machine

DRAFT
→ QUOTED
→ REQUESTED
→ SEARCHING
→ DRIVER_OFFERED
→ DRIVER_ASSIGNED
→ DRIVER_EN_ROUTE
→ DRIVER_ARRIVED
→ RIDER_ONBOARD
→ IN_PROGRESS
→ COMPLETED

Terminal/alternate:
- RIDER_CANCELLED
- DRIVER_CANCELLED
- SYSTEM_CANCELLED
- NO_DRIVER
- EXPIRED

Compatibility mapping for current clients:
- REQUESTED remains accepted input/output.
- DRIVER_ASSIGNED remains valid.
- STARTED maps to IN_PROGRESS at API compatibility boundary.
- CANCELLED maps from any terminal cancellation state.
- COMPLETED unchanged.

## Driver location freshness

- FRESH: <= 5s
- DEGRADED: >5s and <=15s
- STALE: >15s and <=30s
- OFFLINE: >30s or presence OFFLINE

Dispatch eligibility requires:
- driver verified
- presence AVAILABLE
- location FRESH or explicitly allowed DEGRADED
- compatible service class/vehicle
- no active ride
- no active offer lease
- not suspended

## H3 candidate generation

Input:
- pickup lat/lng
- service class

Algorithm:
1. Convert pickup to H3 cell.
2. Search ring 0.
3. Expand rings until min_candidates reached or max_ring reached.
4. Filter freshness/availability/capabilities.
5. Keep bounded candidate set.
6. Call RoutingProvider matrix for road ETA.
7. Rank candidates.
8. Create offer lease atomically.

H3 resolution is configuration, not hard-coded business logic.

## RoutingProvider contract

- route(origin, destination)
- eta(origin, destination)
- matrix(origins, destinations)
- snapToRoad(point)

Provider adapters must expose timeout, circuit-breaker state and provider name.

## Deterministic dispatch score v1

Inputs:
- pickup ETA
- road distance
- location age penalty
- driver idle duration/fairness
- service class fit
- recent decline/cancel penalty
- optional destination supply penalty

No ML in v1.

## Offer lease protocol

Create offer:
- lease TTL configurable, default 12s
- atomic reservation of driver
- event taxi.dispatch.v1.offer_created

Accept:
- requires offer state=OFFERED
- expires_at > now
- driver matches authenticated driver
- version matches
- atomic transition OFFERED→ACCEPTED
- ride transition DRIVER_OFFERED→DRIVER_ASSIGNED
- emit driver_assigned event in same transaction/outbox

Expire:
- OFFERED→EXPIRED
- release driver reservation
- continue dispatch attempt

## Commands and idempotency

Required idempotency:
- create ride
- accept/decline offer
- start trip
- complete trip
- cancel ride
- payment capture/refund
- payout mutation

All state changes require optimistic version checks.

## Progress detector

After DRIVER_ASSIGNED:
- periodically record route ETA to pickup
- compare ETA/distance trend
- if no progress for configured threshold, mark anomaly
- driver warning
- rider warning
- allow rematch/fee protection after policy threshold

No automatic punitive action solely from one GPS sample.

## Realtime channels

- user:{user_id}
- driver:{driver_id}
- ride:{ride_id}
- org:{organization_id}

Events:
- ride.searching
- dispatch.offer
- ride.driver_assigned
- driver.location
- driver.arrived
- ride.started
- ride.completed
- ride.cancelled
- support.override

Polling remains fallback only.

## Event delivery

Transactional outbox remains mandatory.

Semantics:
- at-least-once
- consumers dedupe by event_id
- aggregate_version prevents regression
- retry with bounded backoff
- dead-letter after max attempts
- operator replay endpoint requires audit reason

## Cancellation reasons

- RIDER_CHANGED_MIND
- RIDER_NO_SHOW
- DRIVER_NO_SHOW
- DRIVER_NOT_PROGRESSING
- DRIVER_EMERGENCY
- VEHICLE_PROBLEM
- UNSAFE_PICKUP
- SYSTEM_TIMEOUT
- DISPATCH_TIMEOUT
- PAYMENT_FAILURE

Cancellation policy decides:
- fee
- penalty
- rematch
- refund
- unlock rider

## Observability

Every request/event carries:
- request_id
- correlation_id
- trace_id
- user_id when known
- driver_id when known
- ride_id when known
- device_id when known

Metrics:
- quote latency
- ride create latency
- dispatch first-offer latency
- acceptance rate
- offer expiry rate
- GPS freshness distribution
- ETA prediction error
- cancellation/rematch rate
- event retry/DLQ rate
- payment failure rate

## Feature rollout

All major marketplace changes go behind feature flags:
- dispatch scoring version
- H3 resolution
- max search ring
- offer TTL
- progress detector thresholds
- routing provider
- pricing version

Rollout: internal → 1% → 5% → 20% → 50% → 100%, with rollback.

## Implementation order

Phase A
1. presence/location schema
2. quote schema
3. offer/lease schema
4. dispatch attempt/audit schema
5. expanded state compatibility layer

Phase B
6. H3 adapter
7. candidate generator
8. deterministic score
9. offer lease API
10. realtime events

Phase C
11. progress detector
12. cancellation policy
13. retry/DLQ
14. routing provider failover
15. feature flag rollout

## Non-goals for 0.2

- dynamic surge
- pooling
- scheduled rides
- ML dispatch
- autonomous repositioning
- real production payments
- production-wide GPS history retention
