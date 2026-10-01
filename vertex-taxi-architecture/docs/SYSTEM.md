# System architecture

```text
Passenger App ─┐
Driver App ────┼── API Gateway / Auth / Rate Limits ── Taxi Core
Control Center ┘                                      │
                                                       ├─ Identity
                                                       ├─ Riders
                                                       ├─ Drivers
                                                       ├─ Fleet/Vehicles
                                                       ├─ Markets/Zones
                                                       ├─ Geo/H3
                                                       ├─ Routing Adapter
                                                       ├─ Pricing
                                                       ├─ Dispatch/Matching
                                                       ├─ Rides/Trips
                                                       ├─ Safety/Support
                                                       ├─ Payments/Ledger
                                                       ├─ Notifications
                                                       └─ Audit
                                                          │
                                  ┌───────────────────────┼────────────────────┐
                                  ▼                       ▼                    ▼
                           PostgreSQL/PostGIS          Redis              Outbox
                           source of truth          hot state          → Streams
                                                                          │
                                                                          ▼
                                                                  async workers

VERTEX VISION ───── `/integration/v1` + domain events ───── Taxi Core
                  (no shared DB / no direct SQL)
```

## Deployment boundaries

- Taxi Core backend — separate deployment.
- Taxi UI — separate deployment.
- PostgreSQL/PostGIS — separate Taxi database.
- Redis — separate Taxi realtime namespace/database.
- VERTEX Vision — separate repository/deployment/database.

## Failure principle

No optional subsystem may prevent the core ride state from being persisted. Routing, ETA ML, notification providers, Redis hot state and external payment providers all have explicit degraded/fallback paths.
