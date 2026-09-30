# ADR-009: Runtime readiness contract

Status: Accepted for VERTEX Vision RC branch

## Decision

VERTEX Vision separates liveness from readiness.

- `/health` proves only that the staging Worker is alive and shows configuration/source metadata.
- `/readyz` proves that the configured PostgreSQL/Supabase staging runtime matches the release contract.

Migration `0010_runtime_readiness.sql` adds
`public.vision_runtime_readiness()`. The function returns only non-sensitive readiness
metadata and checks:

- latest applied migration and migration count;
- required Views operational tables;
- required public RPCs;
- RLS enabled on critical Views tables;
- Views product release state is ACTIVE.

It is executable by the `anon` and `authenticated` roles, but exposes no tenant,
identity, customer, booking or secret data.

## API behavior

The staging Worker calls the readiness RPC with the project publishable key in the
`apikey` header. A user JWT and a service-role/secret key are not required for this
schema-level probe.

If the configured backend is missing the required migration, table, RPC, RLS state or
Views release flag, `/readyz` returns HTTP 503. A green `/health` does not override a
red readiness result.

## Deployment gate

After a staging Worker upload:
1. verify `/health` matches the source commit and required migration;
2. if Supabase staging is configured, require `/readyz` HTTP 200;
3. record database readiness separately from authenticated E2E;
4. authenticated user workflows remain an additional release gate.

## Security boundary

Readiness is intentionally minimal. It must never expose schema definitions, grants,
customer data, role membership, tokens or migration SQL contents.

Production remains gated on real staging Auth E2E, backup/restore validation and explicit
approval.
