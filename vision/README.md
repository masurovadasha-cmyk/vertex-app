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


## Typed response contracts and tracing

Views command results are not returned directly from PostgreSQL. The staging API validates
and projects them through `vision/modules/views/response-contract.mjs`, so unexpected
database fields cannot silently cross into web/Android clients.

Every API response generated by the staging Worker carries an `X-Request-ID`. Successful
Views commands also carry `X-Correlation-ID`, copied from the transaction's domain
correlation identifier. Request IDs identify individual HTTP attempts; correlation IDs tie
the committed business workflow to its audit/outbox trail.


## Runtime readiness

`/health` is liveness/configuration metadata only. `/readyz` performs a database-backed
readiness probe through `vision_runtime_readiness()` and requires the current migration
level, critical Views tables/RPCs, RLS and the ACTIVE Views release state.

The readiness probe returns no tenant or customer data and does not require a service-role
credential. Authenticated end-to-end workflows remain a separate staging gate.


## Real staging Auth E2E

The next release gate is implemented as
`.github/workflows/vision-cloud-e2e.yml`. It is manual and restricted to the GitHub
`staging` environment because it uses a dedicated Supabase staging database, synthetic
Auth credentials and Cloudflare staging deployment credentials.

`vision/staging/provision.mjs` applies checksum-tracked migrations, signs in six distinct
synthetic Supabase Auth identities and maps their verified UUIDs to VISION roles.
`vision/staging/cloud-e2e.mjs` then runs the complete Views workflow through the deployed
staging Worker and separately checks Supabase RLS using real bearer tokens.

The repository records this gate as **required but not yet verified**. Production approval
does not change until that real cloud run succeeds and its sanitized evidence is reviewed.


## Trusted release control

Production promotion is now separated from candidate application code.

The manual promotion workflow may evaluate evidence only when launched from protected
`master`. The trusted controller checkout provides the promotion policy/evaluator, while
the candidate is checked out separately by exact SHA into `candidate/`. Before evidence
artifacts are downloaded, their workflow name, workflow path, successful conclusion,
repository and candidate head SHA are verified through the GitHub Actions API.

Release-evidence workflows and the Android release build pin reviewed GitHub Actions by
immutable commit SHA. RC2 also exercises the effective read-only backup-principal checker
against a synthetic PostgreSQL role before the same checker is allowed near production.

The current RC intentionally records this layer as
`implemented-requires-protected-master-controller`: the controller cannot be considered
trusted until its infrastructure exists on protected master. This does not authorize a
production deploy or database migration.
