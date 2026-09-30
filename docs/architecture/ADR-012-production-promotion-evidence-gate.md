# ADR-012: Production promotion evidence gate

Status: Accepted for VERTEX Vision RC branch

## Decision

A release may not be considered promotable to production merely because source CI,
browser tests, Android build, staging dry-run, RC2 backup/restore drill or any single
workflow is green.

VERTEX Vision therefore introduces an evidence-only Promotion Gate.

The gate has no deployment or migration capability. It evaluates four independent
evidence classes:

1. integrated application assembly;
2. RC2 production-safety report;
3. genuine Supabase staging Auth/RLS E2E;
4. production pre-migration backup/restore evidence.

All evidence must identify the same source commit. The release manifest must separately
state:

- cloudStagingVerified = true;
- productionReady = true;
- productionApproved = true.

Until those flags are explicitly changed after human evidence review, the gate remains
BLOCKED by design.

## Production backup model

A production backup is created before release migrations. It is therefore incorrect to
require the backup source database to already contain the target release migration.

Instead, production backup evidence proves:

- the backup was created through a read-only, non-elevated PostgreSQL principal;
- the backup was restored only into an ephemeral CI database;
- restored migration history is an exact checksum prefix of the current migration chain;
- the restored migration version exactly matches the pre-backup production preflight;
- every protected table that exists in the restored schema still has RLS enabled;
- backup bytes are destroyed before evidence artifact upload;
- the evidence contains no database URL, bearer token or privileged key;
- productionChanged = false.

The sanitized evidence records targetMigration separately from backupSourceLatestMigration.

## N-1 compatibility

RC2 also creates a clean baseline database through
0004_private_subject_permissions.sql and compares it with the expanded current schema.
Baseline public tables, columns, function signatures and RLS protection must remain
compatible.

This converts the rollback statement “previous application must remain compatible with
expanded schema” into an executable CI gate.

## Staging workflow semantics

The workflow named Staging Deploy is manual-only. Missing deployment credentials are an
error for a manual deployment attempt, not a successful deploy. Push/PR verification is
handled by Integrated Assembly and Cloudflare dry-runs.

## Production safety

No workflow introduced by this ADR changes production application code or applies
production migrations.

The production backup/restore workflow reads the production database through a constrained
read-only principal and requires the GitHub production environment. Running it still
requires explicit environment authorization.

Actual production deployment remains a separate future step and requires explicit owner
approval.
