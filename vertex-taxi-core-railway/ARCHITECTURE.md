# Vertex Taxi — Architecture & Production Gates

## Source of truth

- Transactional source of truth: PostgreSQL on Railway.
- Ephemeral geo/presence/offer leases: Redis/Valkey.
- Spatial indexing: H3 v4.
- Mobile/presentation clients never mutate trip state directly; they send commands.
- VERTEX Vision is an external consumer through versioned APIs/events only.
- Cloudflare is an optional edge adapter, not the transactional core.

## Critical invariants

1. One active ride has at most one winning driver.
2. One driver has at most one active offer/ride.
3. Ride state changes use server-side state-machine validation.
4. Offer leases carry a random owner token plus monotonic fencing token.
5. A stale lease holder cannot accept/release a newer lease.
6. Money mutations must be idempotent and eventually use double-entry ledger.
7. Outbox events are at-least-once and consumers must deduplicate by event id.
8. GPS freshness is part of dispatch eligibility.
9. Push failure must never fail ride creation/assignment.
10. Analytics/VISION failure must never block transactional trip completion.

## Release gates

Required before a production promotion:

- Golden E2E: PASS
- Concurrent Dispatch Reliability Gate: PASS
- Presentation Smoke: PASS
- Cloudflare Edge CI (when edge is enabled): PASS
- Android assemble/signature/manifest: PASS
- PostgreSQL migrations forward test: PASS
- backup/restore verification
- secrets/config validation
- rollback plan
- production approval

## Android gates

- Persistent release keystore configured outside repository.
- Google OAuth client IDs configured from real Google project.
- FCM project/service account configured outside repository.
- Background location requested only for driver functionality.
- Location foreground service starts from a user-visible flow.
- High-priority push only for urgent, user-visible events such as driver offers.

## Scaling path

### Current
Railway API + PostgreSQL + Redis/H3 + WebSocket + outbox.

### Next
Separate workers for notification delivery and outbox publishing.

### High realtime load
Cloudflare Worker/WAF at edge and Durable Object WebSocket fan-out.

### High dispatch load
Extract dispatch/geo plane behind stable API/event contracts; keep ride transaction core authoritative.

## Rollback order

1. Disable new feature flag / new dispatch algorithm.
2. Roll mobile/web clients back to previous compatible API behavior.
3. Roll application deployment back.
4. Do not roll back destructive DB migrations; use forward repair migrations.
5. Restore database only for confirmed data-loss/corruption incidents.
6. Replay outbox/DLQ after transactional core is healthy.
