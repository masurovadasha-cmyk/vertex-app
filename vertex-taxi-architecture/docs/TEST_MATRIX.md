# Test matrix

## Domain

- every legal transition succeeds
- every illegal transition returns `invalid_transition`
- terminal states cannot mutate
- stale aggregate version is rejected
- duplicate command returns the original idempotent response

## Dispatch races

- two drivers accept same offer → exactly one reservation
- one driver accepts two offers concurrently → at most one active reservation
- offer expires while accept races → deterministic winner/expiry
- Redis lock unavailable → durable DB invariant still prevents duplicate assignment
- routing provider timeout → fallback matcher continues
- matcher crashes → retry without duplicate offer

## Payments

- duplicate provider callback → one ledger posting
- out-of-order callback → state machine rejects illegal transition
- ledger debit/credit mismatch → transaction rejected
- settlement retry → same idempotency result

## Realtime

- stale driver location becomes ineligible
- Redis restart → hot state rebuild from durable presence/location data
- stream consumer crash → pending entry reclaimed
- duplicate event → consumer deduplication

## Security

- tenant A cannot read tenant B
- passenger cannot issue driver/control commands
- driver cannot access another driver's private data
- Vision has no DB credentials/role
- integration without service identity/secret is fail-closed

## Golden E2E

`Quote → Request → Search → Dispatch → Accept → EnRoute → Arrive → PIN → Start → Complete → Payment → Ledger → Outbox → Integration event`
