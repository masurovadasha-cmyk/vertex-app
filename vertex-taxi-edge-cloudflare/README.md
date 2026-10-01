# Vertex Taxi Cloudflare Edge

Optional edge layer in front of Railway Taxi Core.

Responsibilities:
- TLS/edge ingress and security headers
- public presentation/demo/API routing
- future WAF/rate limiting
- future Durable Objects WebSocket fan-out
- future Queues delivery workers

Not responsibilities:
- transactional ride source of truth
- payments ledger
- driver leases
- PostgreSQL data

Those remain in Railway/PostgreSQL/Redis.
