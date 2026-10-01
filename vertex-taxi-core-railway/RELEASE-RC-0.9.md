# Vertex Taxi RC 0.9 — Security & Release Readiness

Status: STAGING RC — not production-approved.

## Baseline

- Core: Railway / Node 22 / Fastify
- Durable state: PostgreSQL 17
- Ephemeral geo and leases: Redis + H3 v4
- Android: target SDK 35
- Edge adapter: Cloudflare Worker (optional; credentials not configured)
- VERTEX Vision: separate system; integration only through versioned API/events

## Verified gates

- Golden E2E
- Concurrent Dispatch Reliability
- Failure Injection
- Notification Worker Load
- Backup / Restore Drill
- Clean PostgreSQL Migration Preflight
- Presentation Smoke
- Cloudflare Edge Unit CI
- Android build / manifest / signature verification
- Security Preflight

## Security baseline

- CORS explicit allowlist; no wildcard origin.
- Demo endpoints isolated and rate-limited.
- Protected /v1 endpoints require staging authorization.
- Security response headers enabled.
- Separate /livez and dependency-aware /readyz.
- No keystore, Google service account, google-services.json or private key is committed.
- Dispatch offer leases use random owner token + monotonic fencing token.
- Push delivery is outbox-based and cannot block ride transaction flow.

## Production credential gates

The following MUST be real external credentials and MUST NOT be committed:

1. Android persistent release keystore.
2. Google OAuth Android/Web client configuration.
3. Firebase/FCM project + service account / workload identity.
4. Cloudflare API/account credentials if edge deployment is enabled.

## Production blockers

- Persistent Android signing is not activated.
- Google login remains presentation/demo until real OAuth project is connected.
- FCM provider adapter is not activated until real Firebase credentials exist.
- Real payment provider and double-entry production ledger are not activated.
- Production/master promotion requires explicit approval.

## Rollback

Application deployments may roll back to the previous compatible image.
Database schema uses forward repair migrations; destructive migration rollback is prohibited.
Outbox/DLQ replay occurs only after transactional core health is restored.
