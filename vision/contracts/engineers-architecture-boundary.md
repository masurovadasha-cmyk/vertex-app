# VERTEX Engineers architecture boundary

VERTEX Engineers is a standalone product and source of truth. VERTEX Vision may integrate with it only through versioned APIs, domain events and explicitly mapped permissions.

## Engineers owns

- engineering projects, estimates and procurement;
- engineering assets, including elevator and HVAC/MEP records;
- maintenance work orders and technician execution state;
- engineering compliance and incident state;
- its own database, deployment and release lifecycle.

## Vision may consume

- stable Engineers IDs and explicitly permitted projections;
- the versioned API rooted at `/api/v1/engineers`;
- selected `engineers.*` domain events;
- delegated tenant/organization identity and correlation IDs.

## Vision must never access

- the Engineers database directly;
- Engineers private schemas or implementation code;
- private technician/asset records that are not exposed by contract;
- Engineers credentials or internal queues.

## Required invariants

1. Engineers and Vision remain independently deployable.
2. Vision does not import the standalone Engineers implementation.
3. Mutating cross-product commands are idempotent before activation.
4. Events carry event, tenant, organization and correlation identifiers.
5. Failure of Engineers must fail closed and must not corrupt VISION state.
6. Engineers remains REGISTERED / not connected until staging identity, RLS mapping and E2E are proven.

This repository contains only the VISION-side contract and registration metadata. The Engineers implementation remains in its separate project/codebase.
