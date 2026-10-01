# Vertex Taxi ↔ VERTEX Vision staging gateway

VISION staging supports two mutually compatible server transports. The default `vision/wrangler.jsonc` has no hard Service Binding so cross-account P-256 HTTPS staging can deploy immediately. `vision/wrangler.service-binding.jsonc` adds `VERTEX_TAXI_CORE` targeting `vertex-taxi-core-staging` and is used only after that Worker exists in the same Cloudflare account. Neither transport grants VISION database access.

## Server gateway

VISION staging exposes authenticated routes:

- `GET /api/taxi/capabilities`
- `GET /api/taxi/health`
- `GET /api/taxi/rides/{ride_id}`
- `POST /api/taxi/rides`
- `POST /api/taxi/rides/{ride_id}/commands`

The gateway first authenticates the VISION user against the existing staging identity layer, verifies that the user has an active membership in the requested tenant/organization context, and derives `x-vertex-user-id` from the verified identity (never from a client-supplied user-id header). It then forwards the delegated identity/tenant headers and mutation idempotency key. Taxi remains the source of truth.

## Transport order

1. `env.VERTEX_TAXI_CORE.fetch(...)` via Service Binding.
2. Optional HTTPS fallback when `TAXI_INTEGRATION_URL`, `TAXI_INTEGRATION_KEY_ID`, and the Worker secret `TAXI_INTEGRATION_PRIVATE_JWK` are configured. VISION signs the delegated request with ECDSA P-256; Taxi Core verifies the public key.
3. Otherwise fail closed with `taxi_integration_not_configured`.

No Taxi credentials or private signing keys are committed to Git. The HTTP fallback uses asymmetric P-256 service proof; there is no shared-secret fallback.

## Staging deployment modes

**Cross-account / temporary host**

Deploy VISION with `vision/wrangler.jsonc`, then configure:
- `TAXI_INTEGRATION_URL` as a non-secret staging variable containing only the HTTPS origin (no path, query, credentials or fragment);
- `TAXI_INTEGRATION_PATH_PREFIX` as `/_api` when the external Taxi runtime is Floot; omit it for a native `/integration/v1` runtime;
- `TAXI_INTEGRATION_KEY_ID` as a non-secret key identifier;
- `TAXI_INTEGRATION_PRIVATE_JWK` as a Worker secret.

**Same Cloudflare account**

Deploy standalone Taxi Core first as `vertex-taxi-core-staging`, then deploy VISION with `vision/wrangler.service-binding.jsonc`. Cloudflare requires the target Worker to exist before the caller Worker with the binding is deployed. The P-256 service proof remains valid and the HTTP URL can be removed.

Production remains unchanged until the staging golden flow passes:

`VISION → create ride → dispatch → driver accept → trip → complete → Taxi event → VISION projection`


## Event return path

The request gateway does not by itself complete the reverse event path. The agreed async boundary remains `Taxi Outbox → Event Gateway → VISION Inbox`, with at-least-once delivery and deduplication by event id. `Taxi event → VISION projection` remains a required staging gate before the Golden E2E can be declared complete.

## Cross-account staging transport

When Taxi Core is temporarily hosted outside the VISION Cloudflare account, use the HTTPS fallback with the same `/integration/v1` contract. The request signature covers method, path/query, timestamp, tenant, organization, verified user id, caller, the authorization-token hash and body hash. The timestamp window is five minutes. Moving Taxi Core into the same Cloudflare account later changes only the transport to Service Binding; the API and delegated identity contract stay unchanged.

## Floot staging adapter

The current standalone staging runtime is published at `https://vertex-taxi-core-staging.floot.app`.
Floot exposes server endpoints under `/_api` and does not support dynamic backend route params. When `TAXI_INTEGRATION_PATH_PREFIX=/_api`, VISION adapts the canonical Taxi contract as follows:

- `/integration/v1/capabilities` → `/_api/integration/v1/capabilities`
- `/integration/v1/health` → `/_api/integration/v1/health`
- `POST /integration/v1/rides` → `POST /_api/integration/v1/rides`
- `GET /integration/v1/rides/{ride_id}` → `GET /_api/integration/v1/ride?rideId={ride_id}`
- `POST /integration/v1/rides/{ride_id}/commands` → `POST /_api/integration/v1/commands` with `rideId` added to the signed JSON body

The P-256 signature always covers the actual outbound Floot path/query and adapted body. Browser/client-facing VISION routes do not change.
