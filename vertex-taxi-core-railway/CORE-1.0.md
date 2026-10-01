# Vertex Taxi Core 1.0 Foundation

Migration strategy: strangler refactor, never a big-bang rewrite.

The existing verified server remains live while bounded contexts are extracted one at a time behind stable contracts.

Dependency direction:

```
HTTP / WebSocket adapters
        ↓
Application commands / queries
        ↓
Bounded context domain
        ↓
Ports
        ↓
PostgreSQL / Redis / Routing / Push adapters
```

Shared kernel is deliberately small: money, IDs/idempotency, result/error primitives and event envelope.

No business rules belong in shared kernel.

Every write command must eventually support:
- organization/market scope
- actor identity and permission
- idempotency key
- request fingerprint
- correlation/causation IDs
- optimistic aggregate version
- audit entry
- transactional outbox event

Extraction order:
1. pricing-quotes
2. geo-presence
3. dispatch
4. rides
5. notifications
6. identity/RBAC
7. payments-ledger
8. support/safety/integrations

Production/master remains untouched until explicit approval.
