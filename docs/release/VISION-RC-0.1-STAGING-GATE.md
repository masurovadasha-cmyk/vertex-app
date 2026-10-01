# VERTEX VISION RC 0.1 — Staging Gate

Status: implementation gate for the Views-first RC. This document does **not** authorize a production deployment.

## Current baseline

- Production repository: `masurovadasha-cmyk/vertex-app`.
- RC work starts from the current `master`; the old `vision-foundation-0.1` branch is no longer the release baseline.
- VERTEX Vision remains the platform root.
- Vertex Taxi, VERTEX Engineers and Vertex JARVIS remain separate products/codebases. VISION consumes only their versioned contracts/adapters.
- Real cloud authentication, migrations and data writes must be proven in the separate staging project before any production decision.

## Gate A — deterministic preflight

The PR workflow must pass all of the following:

1. Full repository regression suite.
2. PostgreSQL 17 migration/RLS/concurrency tests against a disposable `vision_test_*` database.
3. Main Vertex Worker dry-run.
4. Separate `vertex-vision-staging` Worker dry-run.
5. Staging target validator tests.
6. Negative proof that the migration runner refuses mutation unless `VISION_APPLY_STAGING_MIGRATIONS=YES_APPLY_STAGING`.

No secret or privileged Supabase key is accepted by the application staging configuration.

## Gate B — authenticated staging

Run the workflow manually with `authenticated=true` only after the GitHub Environment `vision-staging` contains the following values.

Environment variables:

- `SUPABASE_STAGING_REF` — exact 20-character staging project ref.
- `SUPABASE_URL` — must equal `https://<ref>.supabase.co`.
- `VISION_STAGING_URL` — HTTPS URL of the separate staging Worker.
- `VISION_STAGING_TENANT_ID` — optional synthetic tenant UUID for an authenticated read probe.

Environment secrets:

- `SUPABASE_PUBLISHABLE_KEY` — only an `sb_publishable_...` key is accepted.
- `VISION_STAGING_DATABASE_URL` — PostgreSQL URL pinned to the same Supabase ref and requiring TLS.
- `CLOUDFLARE_API_TOKEN`.
- `CLOUDFLARE_ACCOUNT_ID`.
- `VISION_STAGING_BEARER_TOKEN` — optional token paired with `VISION_STAGING_TENANT_ID`.

Never configure a service-role key in the Worker.

## Gate C — migration proof

When `apply_migrations=true`, the runner:

- checks that the database target belongs to the exact staging Supabase project;
- requires TLS;
- requires the explicit mutation phrase `YES_APPLY_STAGING`;
- applies migrations through the checksum-aware migration runner;
- confirms all local migration receipts exist;
- confirms every public `vision_*` table has RLS enabled.

Applied migration files are immutable: a changed checksum is a hard failure.

## Gate D — HTTP smoke

After the separate staging Worker deploys:

- `/health` must report `VERTEX VISION`, `staging`, and `configured: true`;
- health responses must be `no-store`;
- anonymous business-data reads must return 401;
- cross-origin business-data reads must return 403;
- when a synthetic bearer token + tenant are supplied, the authorized orders read must return a JSON array with HTTP 200.

## RC 0.1 production decision remains blocked until

- authenticated staging gate is green;
- migration preflight and RLS proof are green;
- a staging backup/restore procedure is executed and recorded;
- Views E2E covers Calendar, Units, Guests, Bookings, Check-in/out, Tasks, Cleaning, Maintenance workflow and Finance read layer;
- rollback instructions identify the exact source commit and Cloudflare deployment to restore;
- no production/master deployment is performed implicitly by the staging workflow.

The staging workflow deploys only `vertex-vision-staging`. It does not merge a PR and does not publish a production release.
