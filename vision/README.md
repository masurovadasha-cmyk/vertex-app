# VERTEX VISION Foundation and Views RC

This directory is the additive foundation for the future Vertex Group operating system. It does not replace the current red Vertex web app, Host Studio or standalone product codebases.

## Non-negotiable boundaries
- PostgreSQL is the intended transactional source of truth.
- Development/staging first. Do not apply these migrations to production until auth identity, RLS policies, backups and restore tests are configured.
- No real PII or secrets in seeds.
- JARVIS remains a separate project and may only integrate through future VISION API contracts.
- Vertex Taxi and VERTEX Engineers remain separate projects and integrate only through versioned contracts/APIs/events.
- Business modules do not read/write another module's private storage directly.
- Critical writes require server-side authorization, idempotency, audit and transactional outbox.

## Implemented foundation
Organization graph, tenant-safe foreign keys, identity membership/RBAC, Customer,
Service Registry, Order, Task, append-only Audit/history, transactional Outbox,
Module Contract, module registry and fail-closed RLS policies.

## Views RC 0.1 operational layer
The RC branch adds a real Views backend domain rather than a UI-only placeholder:

- Units with tenant/organization scope and RLS.
- Guest directory backed by VISION Customer identities.
- Bookings with optimistic versions and overlap protection at confirmation.
- Calendar read view.
- Check-in and check-out state transitions.
- Immutable booking status history.
- Maintenance create/assign/start/complete workflow.
- Dashboard read view.
- Finance **booking-gross read layer only**; it is not a payment ledger and does not claim settlement.
- Dedicated `vision_views_command(jsonb)` boundary with idempotent receipts.
- Audit + transactional outbox events for each successful Views mutation.
- Cloudflare staging API routes under `/api/views/*`.

## Service Golden Flow
VISION Guest -> Views -> Vertex Cleaning -> Cleaning Staff -> Quality -> Audit.

The original service-request flow remains available. The Views RC operational
flow is separate: unit/guest -> draft booking -> confirm -> check-in -> check-out,
plus maintenance workflow. CI exercises both foundations.

The separate Cloudflare staging API delegates real identity to Supabase Auth and
retains the user token for RLS. It fails closed without staging configuration.
Local/CI success is not proof of a deployed staging environment.

- [Permission and transaction contract](PERMISSIONS.md)
- [Development startup and staging setup](STAGING.md)
- [RC 0.1 staging gate](RC-0.1-CHECKLIST.md)

A production VISION backend deployment or production database migration requires
explicit owner approval after a verified cloud staging Golden Flow and the RC gate.
