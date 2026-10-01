# Vertex Taxi ↔ VERTEX Vision staging gateway

The VISION staging Worker now declares a Cloudflare Service Binding named `VERTEX_TAXI_CORE` targeting `vertex-taxi-core-staging`.

Cloudflare requires the target Worker to exist in the same Cloudflare account before the caller Worker can be deployed with the binding. Therefore this branch is intentionally a **staging integration gate** until the standalone Taxi Core Worker is deployed under that name. The binding is not a browser API and does not grant VISION database access.

## Server gateway

VISION staging exposes authenticated routes:

- `GET /api/taxi/capabilities`
- `GET /api/taxi/health`
- `GET /api/taxi/rides/{ride_id}`
- `POST /api/taxi/rides`
- `POST /api/taxi/rides/{ride_id}/commands`

The gateway first authenticates the VISION user against the existing staging identity layer. It forwards only the delegated identity/tenant headers and mutation idempotency key. Taxi remains the source of truth.

## Transport order

1. `env.VERTEX_TAXI_CORE.fetch(...)` via Service Binding.
2. Optional authenticated HTTP fallback when `TAXI_INTEGRATION_URL` and the secret `TAXI_INTEGRATION_SHARED_SECRET` are configured.
3. Otherwise fail closed with `taxi_integration_not_configured`.

No Taxi credentials are committed to Git.

## Required Taxi staging deployment

Deploy the standalone Taxi Core Worker first as:

`vertex-taxi-core-staging`

Then deploy this VISION staging Worker. Cloudflare's Service Binding deployment order is target Worker first, caller Worker second.

Production remains unchanged until the staging golden flow passes:

`VISION → create ride → dispatch → driver accept → trip → complete → Taxi event → VISION projection`

