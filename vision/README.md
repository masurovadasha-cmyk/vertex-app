# VERTEX VISION RC1 — Hub, Views and Golden Flow

This directory is the additive foundation for the future Vertex Group operating system. It does not replace the current red Vertex web app, Host Studio or Taxi demo.

## Non-negotiable boundaries
- PostgreSQL is the intended transactional source of truth.
- Development/staging first. Do not apply these migrations to production until auth identity, RLS policies, backups and restore tests are configured.
- No real PII or secrets in seeds.
- JARVIS remains a separate project and may only integrate through future VISION API contracts.
- Business modules do not read/write another module's private storage directly.
- Critical writes require server-side authorization, idempotency, audit and transactional outbox.

## RC1 module policy
- VERTEX VISION is the root Hub.
- Views Hotel & Apartments is the only `ACTIVE` launchable module.
- Every other registered direction is `COMING_SOON` and exposes no Hub actions.
- The Hub reads this policy from the canonical registry; migration `0006` persists matching database release metadata.
- JARVIS remains a separate project and may integrate only through a future external API.

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

The RC branch does not authorize a production release. Production deployment requires the
owner's explicit approval after a verified cloud staging Golden Flow, migration/RLS checks,
smoke tests and rollback validation.
