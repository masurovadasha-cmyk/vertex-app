# Domain events

Envelope:

```json
{
  "event_id": "uuid",
  "event_type": "taxi.ride.v1.completed",
  "schema_version": 1,
  "tenant_id": "uuid",
  "organization_id": "uuid",
  "aggregate_id": "uuid",
  "aggregate_version": 7,
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "occurred_at": "ISO-8601",
  "payload": {}
}
```

Core events: `taxi.ride.v1.requested`, `taxi.ride.v1.driver_assigned`, `taxi.trip.v1.started`, `taxi.trip.v1.completed`, `taxi.ride.v1.cancelled`, `taxi.payment.v1.completed`, `taxi.safety.v1.incident_created`, `taxi.dispatch.v1.offer_created`, `taxi.dispatch.v1.offer_accepted`, `taxi.dispatch.v1.offer_declined`.

Delivery is at-least-once. Consumers deduplicate by `event_id`. Outbox is the source for publication.
