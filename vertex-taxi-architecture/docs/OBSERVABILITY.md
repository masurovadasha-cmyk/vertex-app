# Observability

Every request and event carries `correlation_id`; commands also carry `causation_id` where applicable.

Metrics:

- quote latency
- request acceptance rate
- search-to-assignment latency
- offer acceptance rate
- redispatch rate
- pickup ETA error
- cancellation rate by stage
- driver online/location freshness
- dispatch candidate count
- reservation conflicts
- outbox lag
- stream pending entries
- ledger imbalance count (must be zero)
- payment callback duplicates
- safety incidents

Traces: API → domain command → repository transaction → outbox → dispatch worker → notification.

Alerts are tied to SLOs, not arbitrary CPU thresholds alone.
