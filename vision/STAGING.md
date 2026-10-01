# VISION development and staging

The VISION foundation is already present in the main application repository.
That does **not** authorize a production VISION backend deployment or production
database migration. Cloud staging remains the required gate.

## Local development (ready)

From the repository root:

```sh
npx --yes pnpm@11.19.0 --dir vision install --frozen-lockfile
node vision/backend/dev.mjs
```

Open `http://127.0.0.1:8790`. Data persists in ignored `vision/.data/development`.
The six synthetic profiles exercise the real PostgreSQL migrations/RLS/commands
using PGlite. The development server binds only to loopback, checks Host and
Origin, and requires JSON for commands. **Never expose it with a tunnel, proxy,
public port, or Cloudflare deployment.** Its profile switcher is explicitly a
development impersonation mechanism, not authentication.

Walkthrough: Guest creates → Views sees the request → Vertex Cleaning assigns →
Cleaning Staff starts and submits → Quality passes (or returns for rework) →
Audit reads the immutable event trail. Staff see only their assigned orders.

Before cloud work, run:

```sh
node vision/tools/staging-preflight.mjs
```

This verifies the migration sequence/checksums and static staging Worker safety
settings. Keep its output with the RC evidence.

## Cloud staging

1. Create or use the dedicated Supabase project `vertex-vision-staging`. Enable
   Data API and RLS as required by the project, and keep database-owner credentials
   outside the Worker and source repository.
2. Apply **every** SQL file currently present in `vision/database/migrations/`
   exactly once, in lexical order. Do not hard-code an old migration ceiling.
   `backend/migrate.mjs` provides checksum-tracked application for PostgreSQL
   adapters exposing `query` and `exec`. Never edit an already-applied migration;
   add a new numbered migration instead.
3. Create six distinct synthetic Auth users, then map their verified Auth UUIDs to
   `guest`, `views`, `dispatcher`, `staff`, `quality`, `audit` via
   `provisionDemo(db, identities)`. This function only provisions VISION records;
   it does not create Auth accounts or passwords. Never use real guest PII.
4. Set `SUPABASE_STAGING_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` for
   the separate staging Worker. The URL must match the project ref exactly. The
   Worker accepts only a Supabase `sb_publishable_` key, never a privileged key.
   Keep local values in ignored `.dev.vars` or the platform secret store.
5. Build and deploy **only** the staging config:

   ```sh
   npx wrangler deploy --config vision/wrangler.jsonc --dry-run
   npx wrangler deploy --config vision/wrangler.jsonc --keep-vars
   ```

6. Run the live configuration/health gate:

   ```sh
   VISION_STAGING_URL=https://<staging-worker-host> \
   SUPABASE_STAGING_REF=<20-char-ref> \
   SUPABASE_URL=https://<20-char-ref>.supabase.co \
   SUPABASE_PUBLISHABLE_KEY=<sb_publishable_key> \
   node vision/tools/staging-preflight.mjs --live
   ```

7. Perform the entire Golden Flow using genuine Auth access tokens. Test another
   guest, an unassigned staff member, a suspended user, changed-payload retry and
   stale version. Confirm table reads obey RLS even when called directly through
   Supabase, not just through the Worker.
8. Record actual project ref, source commit, deployed Worker version, URL,
   migration checksums and smoke-test results. A configured `/health` is only a
   liveness/configuration signal, **not proof of working Auth, migrations or RLS**.

Use [RC 0.1 staging checklist](RC-0.1-CHECKLIST.md) as the production approval gate.

### API

- `GET /health`: staging liveness/configuration only.
- `POST /api/commands`: service-request Golden Flow command.
- `POST /api/views/commands`: Views RC operational command.
- `GET /api/orders?tenant_id=UUID`, `/api/tasks`, `/api/history`, `/api/audit`:
  authenticated, RLS-filtered, maximum 50 rows.
- Views read surfaces require `organization_id=UUID` and are hard-allowlisted:
  `/api/views/units`, `/api/views/guests`, `/api/views/bookings`,
  `/api/views/calendar`, `/api/views/maintenance`, `/api/views/finance`,
  `/api/views/dashboard`. Client-supplied PostgREST filters are ignored.

Service-request commands: `create`, `assign`, `start`, `submit`, `pass`, `reject`.

Views commands: `unit.create`, `guest.create`, `booking.create`,
`booking.confirm`, `booking.cancel`, `stay.check_in`, `stay.check_out`,
`maintenance.create`, `maintenance.assign`, `maintenance.start`,
`maintenance.complete`. Existing-entity transitions require `expected_version`.
Actor identity always comes from Auth.

The Views finance endpoint is booking-gross reporting only, not a payment ledger.

### Outbox

Database claim/ack and crash/retry semantics are implemented and tested.
No email, push or other external delivery is implied. A future dispatcher must
use a separate database principal with EXECUTE on `vision_outbox_claim(integer)`
and `vision_outbox_ack(uuid,uuid)` only, and consumers must deduplicate event IDs.
See [permission contract](PERMISSIONS.md).
