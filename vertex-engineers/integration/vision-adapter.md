# Future VERTEX Vision adapter

Status: prepared, not activated.

## Current rule

VERTEX Engineers is developed independently in `vertex-engineers-foundation-0.1`. Do not change VERTEX Vision production/master as part of Engineers foundation work.

## Compatibility target

The manifest mirrors the public fields in `vision/module-sdk/module-contract-v1.json`:

- id
- name
- version
- core
- permissions
- services
- events
- workflows

## Future mount

Suggested module route: `/engineers`

Suggested shared identity fields:

- tenant_id
- organization_id
- user_id
- correlation_id
- event_id

Suggested cross-module references should use IDs/contracts, not direct table coupling.

## Event bridge

Engineers-specific events use the `engineers.*` namespace. A future adapter can translate selected events to VERTEX-wide events after explicit approval.

Examples:

- `engineers.maintenance.requested` -> create/route a platform task
- `engineers.compliance.expiring` -> notification/risk feed
- `engineers.incident.opened` -> priority incident feed
- `engineers.project.stage_changed` -> portfolio timeline

## Merge gate

Before connecting to VERTEX Vision:

1. API contract review
2. permission/RLS review
3. event idempotency review
4. tenant isolation test
5. audit log coverage
6. migration preflight
7. staging E2E
8. explicit production approval

No direct dependency from this foundation into Vision private implementation is allowed.
