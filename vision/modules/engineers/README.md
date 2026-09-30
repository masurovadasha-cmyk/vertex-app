# VERTEX Engineers → VERTEX Vision staging integration 0.1

This branch introduces **registration compatibility**, not production activation.

## What changes

- VERTEX Vision public registry describes Engineers as version 0.2.0 and locally tested.
- `vision/modules/engineers/manifest.json` mirrors the standalone Engineers public module contract.
- `integration.json` declares the future `/engineers` mount and API/scope boundary.
- migration `0006_engineers_module_v0_2.sql` updates module metadata and adds permission definitions.

## What does not change

- No organization receives an Engineers installation automatically.
- No `vision_module_installations` row is inserted.
- No installation state is set to `ENABLED`.
- No Engineers permission is granted to any role.
- No Engineers PostgreSQL schema is applied to VERTEX Vision production.
- No private VERTEX Vision table is read/written by Engineers.
- No Cloudflare production deploy is performed.

## Activation gate

Before an organization can use Engineers through Vision:

1. verified staging identity mapping;
2. tenant/organization scope mapping;
3. Engineers persistent database adapter;
4. RLS verification;
5. staging E2E for project → asset → work-order flow;
6. explicit owner approval for activation/production.
