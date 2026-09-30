# ADR-006: Server-authoritative Application Kernel

Status: Accepted for VERTEX Vision RC branch

## Decision

VERTEX Vision introduces an Application Kernel between the browser shell and business
modules. The browser may identify the requested tenant/organization and present a verified
Auth bearer token, but it is not allowed to declare roles, permissions or module
capabilities.

The canonical context is produced by PostgreSQL through
`vision_session_context(tenant, organization)` after the gateway verifies the JWT.
The function resolves:
- active actor;
- active organization;
- enabled Views installation and ACTIVE product release state;
- organization-scoped roles and permissions;
- guest linkage;
- allowlisted capability booleans.

The staging Worker exposes this only through `GET /api/v1/context` and projects the
database response through an allowlisted DTO contract in `vision/backend/kernel.mjs`.

## Why

A UI-supplied permission array is not a valid authorization source. Even when backend RLS
already prevents privilege escalation, trusting client permissions for navigation creates
split-brain behavior: the browser may display actions that the database will reject, tests
can accidentally validate the wrong policy, and future modules may implement different
authorization assumptions.

The Application Kernel makes one server-derived context the presentation contract while
retaining PostgreSQL/RLS as the final security boundary.

## Rules

1. Auth provider establishes identity only; it does not grant VISION business roles.
2. Tenant and organization are explicit request scope and are validated server-side.
3. Release state and tenant module installation are both required.
4. UI capability visibility comes only from the server context DTO.
5. Queries remain protected by RLS even after context resolution.
6. Commands re-authorize in the database transaction; context is never a write permit.
7. No service-role credential is used for end-user requests.
8. The access token is not persisted by the Views operations module.

## Extension path

Future modules must register their own capabilities behind the same Kernel contract rather
than inventing browser-specific role logic. Cross-module orchestration may use explicit
application policies, but no module receives blanket access to another module's tables.

Production remains gated on real staging Auth, cloud migrations, authenticated E2E and
explicit approval.
