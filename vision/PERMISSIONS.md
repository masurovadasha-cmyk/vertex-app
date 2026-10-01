# VISION permission contract v1

The JWT subject is established by Supabase Auth/PostgREST. No request field can
select an actor or grant a role. Plain PostgreSQL deployments must use a trusted
JWT-verifying gateway that installs transaction-local `request.jwt.claims` and
sets the `authenticated` role. Never issue a SQL login to an end user, or use a
table owner/service-role credential to run their queries.

## Service-request Golden Flow

| Profile | Read | Commands |
| --- | --- | --- |
| VISION-GUEST | Own customer orders and status history in the linked Views organization | Create a cleaning request for that customer |
| Views manager | Orders/history requested by their organization | Create |
| Cleaning dispatcher | Provider organization orders/tasks/history | Assign a currently active staff member |
| Cleaning staff | Assigned orders/tasks/history only | Start, submit for quality |
| Quality reviewer | Provider organization orders/tasks/history | Pass or reject; cannot review own assigned work |
| Auditor | Audit events for their organization | None |
| Anonymous, suspended, unrelated organization/tenant | None | None |

## Views RC operational permissions

| Permission | Capability |
| --- | --- |
| `views.unit.read` | Read units |
| `views.unit.manage` | Create/manage units through the trusted command boundary |
| `views.guest.read` | Read guest directory records for that Views organization |
| `views.guest.manage` | Create guest records through the trusted command boundary |
| `views.booking.read` | Read bookings and calendar |
| `views.booking.manage` | Create, confirm or cancel bookings |
| `views.stay.manage` | Check in and check out confirmed stays |
| `views.maintenance.read` | Read maintenance requests |
| `views.maintenance.manage` | Create and move maintenance work through the manager workflow |
| `views.maintenance.assigned` | Read assigned maintenance work |
| `views.finance.read` | Read aggregated booking-gross summaries; no payment-ledger privilege |

Views mutations enter through `vision_views_command(jsonb)`. The command actor is
always the verified JWT subject. `tenant_id` and `organization_id` in a command
are authorization scope selectors only; they cannot grant access. Existing entity
commands re-load the entity under that exact tenant/organization before mutation.

Bookings use `DRAFT -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT` with optional
`DRAFT/CONFIRMED -> CANCELLED`. Transitions require `expected_version`.
Confirmation serializes per unit and rejects overlapping CONFIRMED/CHECKED_IN
date ranges. Booking history, audit events and command receipts are immutable.

Maintenance uses `OPEN -> ASSIGNED -> IN_PROGRESS -> COMPLETED`. Current RC
mutations require `views.maintenance.manage`; assigned-worker self-service can be
expanded later without weakening the manager gate.

The finance view reports booked gross amounts by arrival month and currency for
CONFIRMED/CHECKED_IN/CHECKED_OUT bookings. It is intentionally not a settlement,
cash, payout, tax or payment-provider ledger.

## Shared authorization rules

Permissions require active user, organization and membership records. Guest
links require an active user, organization and link. Organization hierarchy does
not imply inherited permissions. Grants are exact, explicit and scoped.

All VISION tables enable RLS, including role assignments, history and receipts.
Client INSERT/UPDATE/DELETE and direct identity/RBAC/outbox reads are revoked.
Private helpers and command functions have a fixed empty search path and re-check
permission. Database owners and superusers remain privileged operators, outside
the end-user threat boundary.

Composite foreign keys prevent cross-tenant references even during privileged
imports. Audit/history/receipts reject UPDATE and DELETE. Operators must not
grant TRUNCATE, table ownership, role membership, or private function creation
to gateway/dispatcher principals.

## Transactions and delivery

The service-request `vision_command(jsonb)` and Views `vision_views_command(jsonb)`
use separate receipt tables with idempotency scope `(tenant, actor, key)`. Exact
retries return the stored response; changed payloads conflict. Permissions are
checked before replay. Mutation state changes, audit, receipt and outbox writes
are committed atomically.

Outbox claim uses `FOR UPDATE SKIP LOCKED`, a 60-second lease and a unique lease
token. Only its current holder may acknowledge delivery. A crash before ack can
cause redelivery: **at-least-once**, not exactly-once. Consumers must deduplicate
by event ID and must not depend on global delivery order.

## Verification

`node --test vision/tests/database.test.mjs vision/tests/views-rc.test.mjs`
exercises actual SQL with embedded PostgreSQL (PGlite). CI also runs the suite
against disposable PostgreSQL 17 where configured. Never point the test database
URL at staging or production.
