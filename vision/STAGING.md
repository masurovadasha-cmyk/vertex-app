# VISION development and staging

Production `vertex-app` and root Wrangler config are separate and unchanged.
Do not merge this feature into master or deploy to production without the
owner's explicit approval after a green staging smoke test.

## Local development (ready)

From the repository root:

```sh
npx --yes pnpm@11.19.0 --dir vision install --frozen-lockfile
node vision/backend/dev.mjs
```

Open `http://127.0.0.1:8790`. Data persists in ignored `vision/.data/development`.
Views Apart has its own workspace at `/directions/views`; it operates under the
synthetic Views profile and links to the separate Red app. Pending command retries
retain their idempotency key within the current browser tab.
The six synthetic profiles exercise the real PostgreSQL migrations/RLS/commands
using PGlite. The development server binds only to loopback, checks Host and
Origin, and requires JSON for commands. **Never expose it with a tunnel, proxy,
public port, or Cloudflare deployment.** Its profile switcher is explicitly a
development impersonation mechanism, not authentication.

Walkthrough: Guest creates → Views sees the request → Vertex Cleaning assigns →
Cleaning Staff starts and submits → Quality passes (or returns for rework) →
Audit reads the immutable event trail. Staff see only their assigned orders.

## Cloud staging

### Installed staging, 2026-09-30

- Supabase project: `cqtmunppcyjdkhsnkvfh` (`vertex-vision-staging`, Sydney).
- Worker: https://vertex-vision-staging.masurovadasha.workers.dev
- Migrations 0001–0005 were installed atomically through SQL Editor, with normalized
  SHA-256 receipts in `vision_private.schema_migrations` (not the Supabase CLI ledger).
- The Worker has the pinned project URL/ref and a publishable key only.
- `node vision/tools/build-staging-smoke.mjs` generates owner-only SQL in
  `vision/.build/staging-smoke.sql`. Run it in SQL Editor: it refuses existing
  fixture IDs and rolls back all fixtures. Golden Flow, RLS, retries, optimistic
  version conflicts, audit and outbox passed on the cloud database.
- This SQL test simulates gateway JWT claims; it does **not** verify real Auth
  login, email delivery, six real identities, or concurrent cloud sessions.
- Real-user onboarding and authenticated end-to-end staging acceptance remain
  pending. Public UI remains a preview; no production cutover is authorized.

Workerd rejects `redirect: 'error'` in the installed runtime despite that value
appearing in some API references. Upstream fetch uses `manual` and rejects 3xx
without following them. `worker-runtime.test.mjs` guards this with real workerd.

The public preview serves only `vision/public` pages, the reviewed Views stylesheet
and icon, release metadata and a fixed Android-download redirect. Local profile
selection, local commands and development database files are never bundled.
The API remains fail-closed until real staging identity/database configuration.
Public portal availability is not a successful backend Golden Flow.

1. Create a dedicated free Supabase project `vertex-vision-staging`. Enable Data
   API and automatic RLS, disable automatic table grants. Keep the database
   password in the owner's password manager.
2. Apply migrations `0001` through `0005` in order with the trusted database
   owner (Supabase SQL editor or a secure migration job). Do not rerun applied
   files manually. `backend/migrate.mjs` provides checksum-tracked application
   for a dedicated, idle PostgreSQL connection exposing `query` (and optionally
   `exec`). Do not use a pool or transaction-pooling endpoint. The runner locks
   against concurrent migration jobs and rejects edited or divergent history.
3. Create six distinct test Auth users, then map their verified Auth UUIDs to
   `guest`, `views`, `dispatcher`, `staff`, `quality`, `audit` via
   `provisionDemo(db, identities)`. This function only provisions VISION records;
   it does not create Auth accounts or passwords. Use synthetic account details,
   never real guest PII. Do not reuse a seeded profile for a different UUID.
4. Set `SUPABASE_STAGING_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` for the
   separate Worker in `vision/wrangler.jsonc`. The URL must match the project
   ref exactly. The Worker accepts only a Supabase `sb_publishable_` key, never
   a privileged key. Keep local values in ignored `.dev.vars` or the platform
   secret store. No bearer token is persisted by the Worker.
5. Build and deploy **only** the staging config:

   ```sh
   node vision/tools/build-public.mjs
   npx wrangler deploy --config vision/wrangler.jsonc --dry-run
   npx wrangler deploy --config vision/wrangler.jsonc --keep-vars
   ```

6. Verify `/health` and perform the entire sequence using genuine Auth access
   tokens. Test another guest, an unassigned staff member, a suspended user,
   changed-payload retry and stale version. Confirm table reads obey RLS even
   when called directly through Supabase, not just through the Worker.
7. Record actual project ref, source commit, deployed Worker version, URL and
   smoke-test results. A configured `/health` is only a liveness/configuration
   signal, **not proof of working Auth, migrations or successful staging**.

### API

- `GET /health`: staging liveness/configuration only.
- `POST /api/commands`: authenticated JSON command (`type`, `tenant_id`,
  `idempotency_key`, and command-specific IDs/version).
- `GET /api/orders?tenant_id=UUID`, `/api/tasks`, `/api/history`, `/api/audit`:
  authenticated, RLS-filtered, maximum 50 rows. Initial API has no pagination.

Command types: `create`, `assign`, `start`, `submit`, `pass`, `reject`.
For mutations of existing orders, supply `order_id` and `expected_version`.
`assign` also requires `assignee_user_id`. `create` requires `customer_id`,
`requester_organization_id`, `service_id`. Actor identity always comes from Auth.

### Outbox

Database claim/ack and crash/retry semantics are implemented and tested.
No email, push or other external delivery is implied. `backend/outbox.mjs` is an
adapter-driven runner with a delivery deadline and explicit durable acceptance.
It is not scheduled or exposed through the API. Its separate database principal
needs EXECUTE on `vision_outbox_claim(integer)`, `vision_outbox_ack(uuid,uuid)`
and `vision_outbox_nack(uuid,uuid,text)` only. Consumers must deduplicate event IDs.
Events are accepted in order-version sequence, with delayed retries and quarantine
after permanent failure or eight attempts. Quarantine blocks only that aggregate.
See [delivery decisions and recovery](../docs/architecture/ADR-002-ordered-outbox.md).
See [permission contract](PERMISSIONS.md).
