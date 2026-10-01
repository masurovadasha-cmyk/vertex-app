# Vertex Taxi → VERTEX Vision staging event return path

This is the VISION-side consumer foundation for Taxi domain events. It does not move Taxi business data into VISION and it does not give VISION access to Taxi PostgreSQL/PostGIS/Redis.

## Boundary

Expected delivery path:

`Taxi Outbox → dedicated Event Gateway → VISION Inbox → bounded public projection`

The Event Gateway is a server principal. The browser-facing VISION Worker and authenticated end users are not allowed to read the raw inbox or invoke the receive/claim/apply functions.

## Inbox

`vision_inbox_events` stores the canonical event envelope needed for reliable delivery:

- event id (primary deduplication key)
- module and event type
- schema version
- tenant / organization context
- source aggregate id / version
- correlation id
- occurred timestamp
- bounded JSON payload limited to the explicit public fields for each v1 event type
- receive / processing / lease metadata

Delivery is at-least-once. Re-sending the exact same `event_id` is a no-op. Reusing an `event_id` with different content fails closed as `event_id_conflict`.

## Taxi public ride projection

`vision_taxi_ride_projections` is intentionally narrow. It stores only:

- stable ride reference
- public lifecycle status
- stable driver / vehicle references when present
- source event / aggregate references
- correlation and event timestamps

It does **not** store private driver GPS history, dispatch internals, payment credentials, ledger rows, routing traces, or Taxi private schemas. Event payloads containing fields outside the explicit public allowlist are rejected before persistence.

Ride/trip event aggregate versions are not assumed to share one sequence. Projection ordering therefore uses a bounded lifecycle rank plus event time, while source aggregate id/version are retained for traceability. Late lower-rank events cannot regress a completed/cancelled ride, but may fill a previously missing public driver/vehicle reference.

## Server-only operations

- `vision_taxi_inbox_receive(jsonb)`
- `vision_inbox_claim(text, integer)`
- `vision_taxi_inbox_apply(uuid, uuid)`

All are revoked from `public`, `anon`, and `authenticated`. The operator must grant only the required functions to the dedicated Event Gateway / inbox processor principal.

No service-role key is added to the browser-facing VISION Worker.

## Staging gate

This foundation is not the full Golden E2E by itself. Before declaring the Taxi integration complete, staging still requires:

1. standalone `vertex-taxi-core-staging` deployed;
2. real Taxi Outbox delivery into the Event Gateway;
3. dedicated server identity / database connection for inbox operations;
4. successful event receive → claim → projection;
5. end-to-end ride flow:
   `VISION → create ride → dispatch → accept → start → complete → Taxi event → VISION projection`.

Production/master remain out of scope until that staging flow is proven and separately approved.
