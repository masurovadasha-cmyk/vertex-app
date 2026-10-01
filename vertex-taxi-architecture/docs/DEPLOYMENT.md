# Deployment

Environments:

`local → staging → production`

Each environment has separate database, Redis namespace, secrets and service bindings.

Taxi deployment order:

1. Database migrations/backups verified.
2. Taxi Core Worker.
3. Outbox/stream workers.
4. Realtime location worker.
5. Taxi UI.
6. Integration contract checks.
7. Staging E2E.
8. Production approval gate.

VERTEX Vision integration uses Cloudflare Service Binding when both Workers are in the same Cloudflare account. Deploy Taxi target first, then Vision binding changes, then retire any temporary HTTP fallback. Never deploy a Vision binding to an unverified Taxi worker.
