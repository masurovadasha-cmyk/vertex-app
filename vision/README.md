# VERTEX VISION Foundation and Golden Flow

This directory is the additive foundation for the future Vertex Group operating system. It does not replace the current red Vertex web app, Host Studio or Taxi demo.

## Non-negotiable boundaries
- PostgreSQL is the intended transactional source of truth.
- Development/staging first. Do not apply these migrations to production until auth identity, RLS policies, backups and restore tests are configured.
- No real PII or secrets in seeds.
- JARVIS remains a separate project and may only integrate through future VISION API contracts.
- Vertex Taxi and VERTEX Engineers remain separate projects and integrate only through versioned contracts/APIs/events.
- Business modules do not read/write another module's private storage directly.
- Critical writes require server-side authorization, idempotency, audit and transactional outbox.

## Implemented
Organization graph, tenant-safe foreign keys, identity membership/RBAC, Customer,
Service Registry, Order, Task, append-only Audit/history, transactional Outbox,
Module Contract, Views/Cleaning manifests and fail-closed RLS policies.

## First Golden Flow
VISION Guest -> Views -> Vertex Cleaning -> Cleaning Staff -> Quality -> Audit.

The runnable local development backend has six synthetic profiles and a persistent
embedded PostgreSQL database. Create → assign → start → submit → quality pass
(or rework) writes audited, idempotent, version-checked transactions. CI verifies
RLS isolation and multi-connection races on PostgreSQL 17.

The separate Cloudflare staging API delegates real identity to Supabase Auth and
retains the user token for RLS. It fails closed without staging configuration.
Local development success is not proof of a deployed staging environment.

- [Permission and transaction contract](PERMISSIONS.md)
- [Development startup and staging setup](STAGING.md)
- [RC 0.1 staging gate](RC-0.1-CHECKLIST.md)

A production VISION backend deployment or production database migration requires
explicit owner approval after a verified cloud staging Golden Flow and the RC gate.
