# Vertex Taxi → VERTEX VISION staging event return path

VERTEX VISION already has the durable generic event inbox in `0011_event_inbox.sql`.
The Taxi integration reuses that foundation instead of creating a parallel inbox schema.

Expected path:

`Taxi Outbox → dedicated Event Gateway/consumer → vision_event_inbox → bounded VISION projection`

Requirements:
- at-least-once delivery;
- `event_id` deduplication;
- payload hash identity check;
- lease ownership and retry fencing;
- dedicated server principal only;
- browser roles cannot read or mutate the inbox;
- Taxi remains source of truth.

Any Taxi projection in VISION is limited to public lifecycle/reference data such as ride id,
status, driver/vehicle reference when intentionally public, correlation id and source event id.
Never persist live GPS traces, private dispatch state, payment credentials, Taxi ledger rows or
other Taxi private schemas.

The full staging gate remains:
`VISION → create ride → dispatch → accept → start → complete → Taxi event → VISION projection`.
