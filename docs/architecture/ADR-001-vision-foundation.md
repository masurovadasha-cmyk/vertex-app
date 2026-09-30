# ADR-001: VERTEX VISION Foundation

Status: Accepted for implementation on a feature branch.

## Decision
Evolve the existing Vertex application into VERTEX VISION using an additive modular-monolith foundation. Keep the current production client stable while backend contracts are built and verified.

Use one PostgreSQL data platform with tenant/organization context, server-side RBAC/ABAC, immutable audit events, idempotent commands and a transactional outbox. Business directions are modules, not permanent Git branches. JARVIS remains separate and integrates only through permissioned APIs.

## Guardrails
1. Deny by default.
2. One business source of truth.
3. No direct private-table coupling between modules.
4. Money and stock become ledger-based in later phases.
5. External integrations are adapters, never Core.
6. No fake production auth/email verification.
7. Demo identities and seeds are staging/dev only.
8. Production cutover requires backup/restore proof and isolation tests.
