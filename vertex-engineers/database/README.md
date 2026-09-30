# VERTEX Engineers persistence boundary

This directory defines a standalone PostgreSQL persistence contract for VERTEX Engineers.

## Principles

- Every business row is scoped by `tenant_id + organization_id`.
- Cross-table foreign keys carry the same scope columns, preventing accidental cross-tenant relationships.
- Elevators and HVAC are extensions of a common engineering asset record.
- Compliance stores jurisdiction, rule version, source URL and verification time instead of hard-coding one regulator into the domain.
- Domain events are stored through an outbox table for idempotent integration.
- No table references VERTEX Vision private schemas.

## Files

- `schema-v1.sql` — base tables, constraints and indexes.
- `rls-v1.sql` — reference PostgreSQL RLS policy using application session scope.

## Future VERTEX Vision adapter

The future adapter may map verified VERTEX Vision/Supabase identity claims into the same tenant and organization scope. That mapping is deliberately not activated in this branch.

## Deployment status

Schema is source-controlled only. It has not been applied to VERTEX Vision production or any production database.
