# ADR-005 — Taxi/Vision isolation

Status: Accepted

Taxi and VERTEX Vision remain separate repositories/deployments/databases. Integration is only through versioned /integration/v1, events and explicit identities. Cloudflare Service Binding is preferred.

VISION never reads Taxi PostgreSQL/PostGIS, Redis, private dispatch state or ledger rows.
