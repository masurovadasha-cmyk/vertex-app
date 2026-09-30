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


## Views Operations 0.1

The RC branch now includes the first real Views operational vertical slice in migration
`0007_views_operations.sql`: property/unit inventory, bookings, stays and internal
cleaning jobs. All writes go through the authenticated, idempotent
`vision_views_command(jsonb)` transaction. RLS keeps guest booking reads private and
staff operations scoped to the Views organization.

The tested lifecycle is:
`PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT → COMPLETED`, with checkout
atomically moving the unit to `CLEANING` and creating a cleaning job. Verification
returns the unit to `READY`. Confirmation serializes per unit and rejects overlapping
active reservations while allowing adjacent stays.

These APIs remain staging-only until the dedicated Supabase staging project and real Auth
identities are configured and verified.


## Integrated application assembly

Use the canonical whole-product build:

```sh
npm run assemble:vision
```

It rebuilds the VISION web payload, synchronizes Android assets, verifies the architecture
contract and writes `artifacts/assembly/integrated-assembly.json` with the source commit
and SHA256 checksums for the release-critical files and all ordered database migrations.

The machine-readable source of truth is `vision/assembly/manifest.json`. The dedicated
`VERTEX VISION Integrated Assembly` workflow additionally runs the complete regression
suite, PostgreSQL/RLS/integrity tests, desktop/mobile browser verification and dry-runs
both Cloudflare configurations. A green assembly is required but does not authorize a
production merge, production deployment or production database migration.


## Typed command contract

Views commands are validated twice. The staging API first applies the transport-level
allowlist in `vision/modules/views/command-contract.mjs`: known command type, exact
allowed fields, UUIDs, dates, positive record versions, idempotency keys, currency and
bounded money. Unknown fields such as client-supplied admin flags are rejected before the
SQL RPC is called.

PostgreSQL remains authoritative for permissions, module state, booking/cleaning state
transitions, concurrency, audit, receipts and outbox. The API validator is therefore a
narrow input contract, not a replacement for database authorization.
