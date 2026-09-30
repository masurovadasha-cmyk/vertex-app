# VISION permission contract v1

The JWT subject is established by Supabase Auth/PostgREST. No request field can
select an actor or grant a role. Plain PostgreSQL deployments must use a trusted
JWT-verifying gateway that installs transaction-local `request.jwt.claims` and
sets the `authenticated` role. Never issue a SQL login to an end user, or use a
table owner/service-role credential to run their queries.

| Profile | Read | Commands |
| --- | --- | --- |
| VISION-GUEST | Own customer orders and status history in the linked Views organization | Create a cleaning request for that customer |
| Views manager | Orders/history requested by their organization | Create |
| Cleaning dispatcher | Provider organization orders/tasks/history | Assign a currently active staff member |
| Cleaning staff | Assigned orders/tasks/history only | Start, submit for quality |
| Quality reviewer | Provider organization orders/tasks/history | Pass or reject; cannot review own assigned work |
| Auditor | Audit events for their organization | None |
| Anonymous, suspended, unrelated organization/tenant | None | None |

Permissions require active user, organization and membership records. Guest
links require an active user, organization and link. Organization hierarchy does
not imply inherited permissions. Grants are exact, explicit and scoped.

All VISION tables enable RLS, including role assignments, history and receipts.
Client INSERT/UPDATE/DELETE and direct identity/RBAC/outbox reads are revoked.
The only mutation entry point is `vision_command(jsonb)`. Private helpers and
command functions have a fixed empty search path and qualified object names.
Function owners intentionally bypass RLS to check membership without recursive
policies; every command re-checks permission. Database owners and superusers
remain privileged operators, outside the end-user threat boundary.

Composite foreign keys prevent cross-tenant references even during privileged
imports. Audit/history/receipts reject UPDATE and DELETE. Operators must not
grant TRUNCATE, table ownership, role membership, or private function creation
to gateway/dispatcher principals.

## Transactions and delivery

`create → assign → start → submit → pass` is the initial Golden Flow.
Quality rejection returns the job to `IN_PROGRESS`; submission/review can repeat.
Every successful command writes order/task changes, history, audit, receipt and
outbox within the caller's one transaction. An exception rolls all of them back.

Idempotency scope is `(tenant, actor, key)`, with exact JSONB command equality.
Retries return the stored original response; changed payloads conflict. Permission
is checked before replay. Keys are not expired automatically. New transitions
require the current order version and row lock. Task version changes with the
order; direct task writes are not exposed.

Outbox claim uses `FOR UPDATE SKIP LOCKED`, a 60-second lease and a unique lease
token. Only its current holder may acknowledge delivery. A crash before ack can
cause redelivery: **at-least-once**, not exactly-once. Consumers must deduplicate
by event ID and must not depend on global delivery order. Aggregate `version`
supports per-order ordering. Grant claim/ack only to a separate server dispatcher.
External delivery adapters are not connected by these migrations.

## Verification

`node --test vision/tests/database.test.mjs` runs actual SQL with embedded
PostgreSQL (PGlite). CI also runs the suite against an empty disposable
PostgreSQL 17 service with multiple connections, including simultaneous retry
and stale-update races. The test URL must name a `vision_test*` database and the
suite refuses an existing database. Do not point it at staging or production.

References: [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase functions](https://supabase.com/docs/guides/database/functions).


## Views Operations permissions

The Views booking/stay vertical slice uses separate, exact permissions on the Views
organization:

| Permission | Scope |
| --- | --- |
| `views.operations.read` | Read operational properties, units, bookings and internal cleaning jobs |
| `views.booking.create` | Create a pending booking |
| `views.booking.manage` | Confirm, check in, check out or cancel a booking |
| `views.cleaning.execute` | Start and submit an internal checkout-cleaning job |
| `views.cleaning.verify` | Verify cleaning and return the unit to `READY` |

Guests do not receive staff permissions. RLS may expose only bookings whose customer link
belongs to the authenticated guest in the same Views organization. Direct client writes
to Views operational tables remain revoked; mutations go through
`vision_views_command(jsonb)`, which re-checks active identity, organization-scoped
permission, version and idempotency inside the transaction.

Booking confirmation serializes on the unit and rejects overlapping `CONFIRMED` or
`CHECKED_IN` stays. Checkout atomically closes the stay, moves the unit to `CLEANING`,
creates a cleaning job and writes audit/outbox records. Cleaning verification returns the
unit to `READY` and completes the checked-out booking.
