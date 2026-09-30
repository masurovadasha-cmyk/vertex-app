# ADR-011: RC2 production safety, backup/restore and rollback policy

Status: Accepted for VERTEX Vision RC branch

## Decision

VERTEX Vision production releases use an expand-only database strategy after the reviewed
foundation baseline. Application rollback and database disaster recovery are separate
operations.

The release candidate must pass four independent safety gates before production can even
be considered:

1. migration safety scan;
2. read-only database preflight with migration checksum verification;
3. native PostgreSQL backup followed by an actual restore into a clean database and
   domain/RLS verification;
4. explicit rollback policy and owner approval gate.

A green RC2 safety build does not itself authorize production.

## Migration policy

Migrations after `0004_private_subject_permissions.sql` are expand-only. New release
migrations may add tables, columns, indexes, constraints, functions and policies, but may
not silently perform destructive schema operations such as table/column drops, truncation,
renames, type rewrites or CASCADE.

Applied migrations are immutable. Their SHA256 values are recorded in
`vision_private.schema_migrations`. A changed applied file is a release blocker.

If a schema correction is needed, create a new forward migration.

## Backup and restore

Before a production migration, the actual platform/provider backup policy must be verified
and a restorable recovery point must exist.

CI cannot prove the provider's real production backup, so RC2 performs a native PostgreSQL
drill on synthetic data:

- apply the exact VISION migration chain;
- create a booking, audit/outbox data and a processed inbox event;
- create a native `pg_dump`;
- restore it into a brand-new database;
- prove readiness, migration history, booking state, audit/outbox, inbox state and RLS;
- record backup SHA256 and size;
- discard the synthetic dump after verification.

Only sanitized verification reports are uploaded.

## Rollback model

Application rollback:
- switch the production Worker/application to the previous known-good deployment;
- do not run database down-migrations;
- run liveness/smoke checks immediately after rollback.

Database rollback:
- reserved for disaster recovery, not normal application rollback;
- restore from a verified backup/PITR recovery point only after an incident decision;
- ordinary schema mistakes are repaired by a new forward migration.

This requires N-1 application compatibility with the expanded schema.

## Preflight

`vision/production/preflight.mjs` is read-only. It compares every applied migration name
and hash against the release source, rejects gaps or unknown migrations, reports pending
migrations and reads only non-sensitive aggregate counts.

For staging/production targets it requires TLS and an explicitly expected database host.

## Automation

`.github/workflows/vision-rc2-safety.yml` runs the complete synthetic backup/restore
drill and both Cloudflare dry-runs. It has no production credentials and performs no
production deployment.

The release stays:
- `productionApproved=false`
- `productionReady=false`

until real staging Auth E2E, provider backup/restore evidence and explicit owner approval
are completed.

This ADR does not authorize changes to master or production.
