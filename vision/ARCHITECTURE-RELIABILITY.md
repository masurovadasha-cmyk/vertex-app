# VISION reliability boundaries

The platform remains a modular application in one repository: shared identity,
tenant authorization and transactional commands; Views and Cleaning have separate
module contracts. Split deployment units when ownership, traffic or isolation
requires it, not simply because there are multiple business directions.

## Request and data boundaries

- Public Worker verifies Supabase identity and forwards the same user token.
  Database policies and command functions remain the authority. No service-role
  substitution, browser-selected demo identities or direct client writes.
- `vision_session()` returns only the authenticated active caller's context.
  Absence of provisioning is a denied session, not implicit owner access.
- Commands atomically commit domain state, optimistic version, audit, history,
  idempotency receipt and outbox. Retry the identical command after ambiguous
  transport failures. Do not generate another key until the outcome is known.
- Browser tokens are memory-only. Generation checks discard responses from a
  previous login, including a login that finishes after logout. This intentionally
  requires login after reload; it does not promise global immediate JWT revocation.
- Feeds use tenant-scoped keyset pagination ordered by `(created_at, id)`, with
  microsecond timestamps preserved and matching indexes. RLS applies to every
  page. Pagination is a live feed, not a transactionally frozen export.
- Outbox delivery is at least once: downstream adapters must durably deduplicate
  by event ID. Leases, retry budgets and quarantine are implemented; actual
  notification adapters and operational alerting are still deployment work.

## Growth and rollout

Apply versioned migrations before publishing dependent application code. The
staging upgrade generator verifies the exact five-migration baseline and applies
0006/0007 plus receipts in one transaction under the migration lock. Never edit
an applied migration. The new ordinary indexes are suitable for this initial
staging database; large populated installations need a separately reviewed
concurrent-index rollout.

Before broad rollout, load-test realistic tenant sizes, measure query plans and
latency, define traffic limits and recovery objectives, and verify backups and
restore. Session context currently aggregates the caller's accessible request
contexts: a large customer catalog will need a separate paginated search API.
No large-scale capacity claim is made by the current functional test suite.

## Release gate

Run root tests, PostgreSQL multi-connection CI, Worker runtime checks and release
consistency checks. Then verify real authenticated HTTP roles and desktop/mobile
flows in staging. SQL tests using synthetic claims do not replace real Auth
verification. Red production and Android are separate release boundaries.
