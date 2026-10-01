# ADR-004: Views integrity stage / architecture implementation 1.1

Status: implemented in the next-stage branch; not production-ready.
Date: 2026-09-30. Supplements TARGET-ARCHITECTURE-1.0.md and ADR-003.

## Compatibility-first implementation

The RC already contains migration 0007, the Views operations API/UI and a transactional
booking/stay/cleaning state machine. Migration 0008 is additive: no applied migration is
rewritten and no existing booking is silently deleted or relabelled.

For bounded date-based accommodation, this stage uses one inventory row per occupied
night, with primary key (tenant_id, unit_id, stay_date). CONFIRMED and CHECKED_IN bookings
reserve [check_in, check_out); PENDING does not reserve capacity. A trigger maintains this
inventory in the booking transaction, including privileged imports. A conflicting insert
fails atomically. Cancellation/checkout releases reserved nights; a failed date edit
preserves the original reservation. Dates must be finite, periods 1–3660 nights and money
finite. This is an interim alternative to the target range/exclusion inventory model,
not a timed-hold, maintenance-block, OTA or multi-region booking engine.

Composite keys also bind property, unit, booking and cleaning job to the same tenant and
organization. RLS requires Views ACTIVE, an ENABLED installation and the existing subject
permissions. The original state machine is retained in a private function with client
EXECUTE revoked; the public facade rechecks access before every call/replay.

Cleaning start and submission record the trusted actor. Only that executor may submit;
a different authorized reviewer verifies. Verification cannot overwrite a unit that has
since entered MAINTENANCE/BLOCKED or another non-CLEANING state. This is not yet a full
assigned-only housekeeping model: assignment/reassignment, rejection/rework and detailed
worker visibility remain explicit release blockers for real staff deployment.

## Migration preflight

Existing overlaps, cross-organization references or invalid numeric/date values fail the
migration instead of choosing a guest or deleting data. Test the full 0001–0008 chain on
an isolated copy and review conflicts before staging. Historical in-progress jobs without
known executor provenance cannot be silently verified; reconcile them through a separately
reviewed, audited operational procedure. No automated provenance backfill is provided.

The 0008 schema has no ordinary rollback migration. Roll back application code only within
its tested schema compatibility window; use disaster recovery for data restoration. The
current migration runner still needs a dedicated migration-connection lock and full-history
preflight before concurrent/production rollout. Never run two migration jobs concurrently.

## Read API

Views reads now return explicit DTO fields and keep the existing JSON array response.
Default page size is 50, maximum 100. X-Next-Cursor is an opaque base64url pair of exact
created_at and UUID. Reads use descending (created_at,id), request one extra row, retain
PostgreSQL timestamp precision, bind tenant_id and reject malformed/duplicate page controls.
Unknown fields from an upstream response are stripped; malformed rows fail as dependency
unavailability, not as a successful empty dataset. This is keyset pagination, not a frozen
snapshot across pages. API pagination does not imply the existing UI loads every page or
that its current dashboard counts are totals; production UI needs explicit completeness.

## Release reporting and deployment

Keep Views Active and 18 modules Coming Soon. The RC manifest records 0008 and technical
stage views-integrity-1. /health reports sourceCommit, requiredMigration and the explicit
probe label liveness-config-only. configured=true does not prove applied SQL, Auth, RLS
or an authenticated E2E journey. No cloud readiness flag is silently enabled.

Build credentials belong only to the deployment step, not dependency installation/tests.
Missing Cloudflare token, account or staging URL must produce a blocked/failed deployment
result, not a green "deployed" result. The dedicated target stays vertex-vision-staging;
master, production vertex-app, live DBs and JARVIS are outside this stage.

## Follow-up gates

Real Supabase users and applied migration verification; assigned-only staff workflow;
client session/race and stable-retry handling; paginated/date-range UI with honest totals;
readiness probes; backup/restore, migration serialization and production approval. The
separate guest-product backlog is not an instruction to activate future modules.
