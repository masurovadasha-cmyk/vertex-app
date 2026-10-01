# Bounded contexts

Core 1.0 target contexts:

- identity-access
- organizations-markets
- riders
- drivers
- fleet
- geo-presence
- routing
- pricing-quotes
- dispatch
- rides
- payments-ledger
- notifications
- safety
- support
- audit
- integrations

Rules:
1. A context may import kernel/contracts, not another context's internal files.
2. Cross-context communication uses public ports or domain events.
3. PostgreSQL remains transactional source of truth.
4. Redis is ephemeral and cannot be the sole record of completed business transactions.
5. VERTEX Vision consumes public contracts only.
