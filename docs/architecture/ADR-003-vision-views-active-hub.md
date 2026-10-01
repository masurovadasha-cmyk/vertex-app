# ADR-003: Views-only active VERTEX Vision Hub for RC1

Status: Accepted for RC branch

## Decision

VERTEX Vision is the root platform. The initial Hub displays every registered Vertex Group
business direction with its own icon, but **Views Hotel & Apartments is the only ACTIVE
module in RC1**. Every other direction is a `COMING_SOON` future branch.

The public registry, browser shell and database metadata must agree on this state.

## Runtime rules

- `views` has release state `ACTIVE` and may expose its reviewed local actions.
- Every other module has release state `COMING_SOON` and exposes zero Hub launch actions.
- A future module can be made active only by an explicit later release; it must not become
  launchable merely because legacy demo code exists elsewhere in the repository.
- Business modules depend on VISION Core, not directly on one another.
- JARVIS remains a separate repository/deployment and may integrate only through an
  explicitly designed external API.

## Database rules

Migration `0006_views_active_release_state.sql` adds release metadata to
`vision_module_definitions`. It does not enable tenant mutation or cloud writes.
Tenant installations remain a separate authorization concern.

## Safety

This RC does not claim that Supabase staging, real authentication, payments or external
notifications are connected. Those capabilities remain fail-closed until verified in a
dedicated staging environment.

Production deployment remains outside this ADR and requires a separate approval after
green staging, RLS, migration, smoke and rollback checks.
