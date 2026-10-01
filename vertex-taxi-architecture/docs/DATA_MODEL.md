# Data model

Core PostgreSQL bounded schemas/tables:

```text
identity.users
identity.roles
identity.permissions
identity.user_roles

market.markets
market.zones
market.service_classes
market.pricing_versions

rider.riders
rider.saved_places

fleet.vehicles
fleet.vehicle_classes
fleet.vehicle_documents

driver.drivers
driver.driver_documents
driver.driver_status_history

geo.location_samples
geo.driver_presence

ride.quotes
ride.rides
ride.ride_stops
ride.ride_status_history
ride.offers
ride.reservations

payment.payment_intents
payment.provider_events
ledger.accounts
ledger.transactions
ledger.entries

safety.incidents
safety.safety_events
support.tickets

audit.audit_log
integration.outbox
integration.inbox_idempotency
```

The ride aggregate owns lifecycle state. Driver availability is a separate aggregate but reservation references it. Ledger rows never depend on frontend state.

Canonical identifiers are UUID/ULID-like opaque IDs. External IDs are stored separately and never used as authorization keys.
