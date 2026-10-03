# Vertex Taxi Staging Incident & Recovery Runbook

## Principles
- PostgreSQL is the durable source of truth.
- Redis/H3 is the ephemeral coordination/presence plane.
- Never repair money or ride history by deleting durable rows.
- Production/master is not changed from staging incident response.
- Every manual override must leave an audit record before production use.

## 1. /readyz is 503
1. Check /livez.
2. If /livez is 200 and /readyz is 503, inspect PostgreSQL and Redis separately.
3. Stop promotion. Do not retry destructive migrations.
4. Restore dependency health, then re-run Golden E2E + Reliability + Failure Injection.

## 2. Redis unavailable
- Reject new dispatch/offer lease mutations rather than assigning without fencing.
- Existing durable rides remain in PostgreSQL.
- Do not infer ownership from stale client state.
- After Redis recovery, rebuild presence from fresh driver heartbeats only.
- Never replay expired leases.

## 3. PostgreSQL unavailable
- /readyz must remain 503.
- Do not create rides, accept offers, complete trips, or mutate payments.
- Realtime may display last known state but must be marked degraded.
- Restore PostgreSQL first, then reconcile outbox/notification backlog.

## 4. Driver/ride appears stuck
1. Read durable ride state/version and accepted offer.
2. Verify fencing ownership before releasing any lease.
3. Never force a backwards state transition.
4. Use a forward cancellation/recovery command with actor/reason/audit.
5. Re-run the affected ride timeline check.

## 5. Notification backlog
- Ride transaction flow must continue independently.
- Inspect PENDING/RETRY/DEAD counts.
- Fix provider/credential issue.
- Replay only idempotent outbox rows.
- Do not resend stale DRIVER_OFFER notifications after offer expiry.

## 6. Bad application deploy
- Roll back application image to last compatible successful Railway deployment.
- Do not roll back destructive DB schema.
- Use forward repair migration for schema defects.
- Verify /livez, /readyz, Golden E2E, Reliability and Presentation Smoke.

## 7. Migration failure
- Startup must fail closed if required migration cannot apply.
- Inspect exact failing migration.
- Never edit an already-applied migration in place.
- Add a forward repair migration.
- Run clean-DB migration preflight before redeploy.

## 8. Release evidence required before promotion
- Core Unit: PASS
- Architecture Boundaries: PASS
- Security Preflight: PASS
- Failure Injection: PASS
- Golden E2E: PASS
- Reliability Gate: PASS
- Presentation Smoke: PASS
- Backup/Restore Drill: PASS
- Migration Preflight: PASS
- Android build/manifest/signature: PASS
- /readyz: ready

## Current external credential gates
Persistent Android signing, Google OAuth, FCM and optional Cloudflare deployment remain blocked until real owner-controlled credentials are configured.
