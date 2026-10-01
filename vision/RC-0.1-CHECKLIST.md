# VERTEX VISION RC 0.1 — staging gate

This checklist is the release-candidate gate for the **Views vertical only**.
It does not authorize production deployment or production database changes.

## 1. Code and scope freeze
- [ ] RC branch is based on the intended `master` commit.
- [ ] Views scope only: Vision Hub, Views Dashboard, Calendar, Units, Guests, Bookings,
      Check-in, Check-out, Tasks, Cleaning, Maintenance workflow/read layer,
      Finance read layer, permissions/RLS, audit, domain events, idempotency,
      health/readiness and observability.
- [ ] Other business directions remain registered/Coming Soon unless a separately
      approved integration contract is being tested.
- [ ] Vertex Taxi, VERTEX Engineers and Vertex JARVIS remain separate codebases.

## 2. Static preflight
- [ ] `node vision/tools/staging-preflight.mjs` passes.
- [ ] All migration files are sequential, checksum recorded and unchanged after apply.
- [ ] Cloudflare staging config still targets `vertex-vision-staging`.
- [ ] `VISION_ENV=staging`, preview URLs disabled, observability enabled.
- [ ] Existing Vertex regression tests and VISION PostgreSQL/RLS tests pass.
- [ ] Wrangler staging dry-run passes.

## 3. Staging infrastructure
- [ ] Dedicated Supabase staging project is used; never production.
- [ ] Supabase project ref and URL match exactly.
- [ ] Only `sb_publishable_...` is exposed to the Worker.
- [ ] Database owner/service credentials remain outside Worker/runtime variables.
- [ ] All migrations in `vision/database/migrations/` are applied once in lexical order.
- [ ] Six synthetic Auth identities are mapped to guest/views/dispatcher/staff/quality/audit.
- [ ] No real guest PII is used.

## 4. Backup and recovery
- [ ] Pre-migration staging backup/snapshot recorded.
- [ ] Restore procedure is tested on staging or an isolated recovery database.
- [ ] Migration rollback/recovery notes are recorded for the RC.
- [ ] No production backup/restore action is performed by this RC.

## 5. Live staging verification
- [ ] `VISION_STAGING_URL=... SUPABASE_STAGING_REF=... SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node vision/tools/staging-preflight.mjs --live` passes.
- [ ] `/health` reports VERTEX VISION / staging / configured=true.
- [ ] Genuine Supabase Auth tokens are used for smoke tests.
- [ ] Golden flow passes: Guest → Views → Cleaning dispatcher → Staff → Quality → Audit.
- [ ] Rework/reject path passes.
- [ ] Cross-tenant reads are denied by RLS.
- [ ] Unassigned staff cannot read or mutate another staff member's order.
- [ ] Suspended/unauthorized user is denied.
- [ ] Duplicate idempotency key with same payload is safe.
- [ ] Duplicate idempotency key with changed payload is rejected.
- [ ] Stale expected_version is rejected.
- [ ] Direct Supabase table reads obey RLS, independently of the Worker.
- [ ] No private upstream/database details appear in client errors.

## 6. Observability and evidence
- [ ] Source commit SHA recorded.
- [ ] Supabase staging project ref recorded (non-secret).
- [ ] Cloudflare staging Worker version/deployment ID recorded.
- [ ] Staging URL recorded.
- [ ] CI run IDs and results recorded.
- [ ] Migration checksum output attached to the RC evidence.
- [ ] Smoke-test result and timestamp recorded.
- [ ] Error/latency logs reviewed for the smoke window.

## 7. Production approval gate
- [ ] RC is not deployed to production automatically.
- [ ] Production migrations are not applied automatically.
- [ ] Production secrets/config are not changed automatically.
- [ ] Explicit owner approval is obtained only after every applicable staging gate above is green.
