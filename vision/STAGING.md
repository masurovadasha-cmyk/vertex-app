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
The six synthetic profiles exercise the real PostgreSQL migrations/RLS/commands
using PGlite. The development server binds only to loopback, checks Host and
Origin, and requires JSON for commands. **Never expose it with a tunnel, proxy,
public port, or Cloudflare deployment.** Its profile switcher is explicitly a
development impersonation mechanism, not authentication.

Walkthrough: Guest creates → Views sees the request → Vertex Cleaning assigns →
Cleaning Staff starts and submits → Quality passes (or returns for rework) →
Audit reads the immutable event trail. Staff see only their assigned orders.

## Cloud staging

1. Create a dedicated free Supabase project `vertex-vision-staging`. Enable Data
   API and automatic RLS, disable automatic table grants. Keep the database
   password in the owner's password manager.
2. Apply migrations `0001` through `0009` in order with the trusted database
   owner (Supabase SQL editor or a secure migration job). Do not rerun applied
   files manually. `backend/migrate.mjs` provides checksum-tracked application
   for PostgreSQL adapters exposing `query` and `exec`.
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
   npx wrangler deploy --config vision/wrangler.jsonc --dry-run
   npx wrangler deploy --config vision/wrangler.jsonc --keep-vars
   ```

6. Verify `/health` and perform the entire sequence using genuine Auth access
   tokens. Test another guest, an unassigned staff member, a suspended user,
   changed-payload retry and stale version. Confirm table reads obey RLS even
   when called directly through Supabase, not just through the Worker.
7. Confirm module release metadata: `views=ACTIVE`; every other module definition is
   `COMING_SOON`. Tenant module installations remain separately authorized and must not
   be silently enabled.
8. Record actual project ref, source commit, deployed Worker version, URL and
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
No email, push or other external delivery is implied. A future dispatcher must
use a separate database principal with EXECUTE on `vision_outbox_claim(integer)`
and `vision_outbox_ack(uuid,uuid)` only, and consumers must deduplicate event IDs.
See [permission contract](PERMISSIONS.md).


## Views Operations 0.1 staging gate

Migration `0007_views_operations.sql` adds the first transactional Views vertical slice:
properties/units, bookings/stays, internal cleaning jobs, RLS and
`vision_views_command(jsonb)`.

Versioned staging routes:

- `GET /api/v1/context?tenant_id=UUID&organization_id=UUID`: server-authoritative roles, permissions and Views capabilities.
- `POST /api/v1/views/commands`
- `GET /api/v1/views/bookings?tenant_id=UUID`
- `GET /api/v1/views/units?tenant_id=UUID`
- `GET /api/v1/views/cleaning?tenant_id=UUID`

The required smoke sequence is:
`create_booking → confirm_booking → check_in → check_out → cleaning_start → cleaning_submit → cleaning_verify`.
The final state must be booking `COMPLETED`, cleaning `VERIFIED` and unit `READY`.
An overlapping confirmed booking must fail with conflict, while adjacent date ranges are allowed.


## Views UI Integration 0.1

The active Views Hub action opens `VertexVisionViews`, a real-data operations workspace
with Dashboard, Calendar, Bookings, Units and Cleaning tabs. It does not substitute
legacy/demo metrics when an operational session is missing.

The browser session is configured in memory only:

`await VertexVisionViews.configure({ tenantId, organizationId, token })`

The access token is not written to localStorage by this module. The verified Supabase session supplies only the token; roles, permissions and capabilities are resolved by `GET /api/v1/context` from PostgreSQL RBAC. Without that session the
workspace shows an explicit NOT CONNECTED state and keeps the legacy Host Studio separate
as a demo-only surface.

The dedicated `vertex-vision-staging` Worker now serves the built VISION assets and runs
first for `/api/*` and `/health`, so staging UI and staging API can remain same-origin.
The public production Worker continues to fail closed for `/api/v1/views/*`.


## Application Kernel 0.1

Migration `0009_application_kernel.sql` adds
`vision_session_context(tenant, organization)`. It derives the authenticated actor from
the verified JWT transaction context and returns only database-authorized roles,
permissions and capability booleans. The browser is never a source of authorization data.

The UI connection contract is now:

`await VertexVisionViews.configure({ tenantId, organizationId, token })`

No `permissions` parameter is accepted or trusted. The staging Worker verifies the token,
then calls the context RPC. A disabled Views installation, inactive actor, unrelated
organization or identity with neither membership nor guest link fails closed.
