# VERTEX VISION FOUNDATION 0.1

This directory is the additive foundation for the future Vertex Group operating system. It does not replace the current red Vertex web app, Host Studio or Taxi demo.

## Non-negotiable boundaries
- PostgreSQL is the intended transactional source of truth.
- Development/staging first. Do not apply these migrations to production until auth identity, RLS policies, backups and restore tests are configured.
- No real PII or secrets in seeds.
- JARVIS remains a separate project and may only integrate through future VISION API contracts.
- Business modules do not read/write another module's private storage directly.
- Critical writes require server-side authorization, idempotency, audit and transactional outbox.

## Foundation 0.1
Organization graph, identity membership/RBAC schema, Customer, Service Registry, Order, Task, Audit, Outbox, Module Contract, Views/Cleaning manifests.

## First Golden Flow
VISION Guest -> Views -> Vertex Cleaning -> Cleaning Staff -> Quality -> Audit.

The current production UI remains untouched until a backend/staging environment is connected and the golden flow passes isolation/retry/concurrency tests.
