# VERTEX Engineers Operational Core 0.2

Status: standalone, tested, not merged into VERTEX Vision production/master.

## Implemented

- Controlled project lifecycle: lead -> survey -> design -> estimate -> contract -> procurement -> installation -> qa_qc -> commissioning -> handover -> warranty_maintenance.
- Elevator asset model with optional technical fields and Safe Lift registration reference field.
- HVAC/MEP asset model covering VRF, chillers, AHU/ventilation, heat pumps, boilers and other engineering assets.
- Work-order lifecycle for preventive, corrective, emergency, inspection and commissioning jobs.
- Work-order priorities: low, normal, high, critical.
- Completion guard requiring technician attribution and a resolution summary.
- Compliance state calculation: valid, expiring, expired, unknown, not applicable.
- Versioned HTTP boundary under `/api/v1/engineers`.
- Tenant + organization scope enforcement in application code.
- Standalone PostgreSQL schema with composite scoped keys and foreign keys.
- Reference PostgreSQL RLS policy.
- Event outbox for future idempotent integration.
- Engineers domain-event contract.

## API 0.2

- GET `/health`
- GET/POST `/projects`
- POST `/projects/{projectId}/stage`
- GET `/assets`
- POST `/assets/elevators`
- POST `/assets/hvac`
- POST `/assets/{assetId}/commission`
- GET/POST `/work-orders`
- POST `/work-orders/{workOrderId}/transition`
- GET `/product-references`

Operational requests are scoped with `x-tenant-id` and `x-organization-id`.

## Quality status

Latest validated CI at the time of this document:
- Node 22
- 13 tests
- 13 pass
- 0 fail

An earlier 0.2 CI run exposed a stale version assertion from foundation 0.1. The assertion was changed to verify API version equals module version, then the entire expanded suite passed.

## Isolation status

VERTEX Engineers remains independent:
- no merge into VERTEX Vision
- no changes to VERTEX Vision production/master
- no private Vision database references
- no direct private Vision code imports

Future integration is through the public module manifest, versioned API, domain events, permissions/RLS and tenant/organization scope.
