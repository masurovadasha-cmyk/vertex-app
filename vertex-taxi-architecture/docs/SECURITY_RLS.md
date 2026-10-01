# Security / RLS

Every request carries authenticated subject, tenant and organization context.

Authorization layers:

1. Edge authentication/rate limit.
2. Application RBAC/ABAC command policy.
3. Repository tenant/org predicates.
4. PostgreSQL RLS as defense in depth.
5. Immutable audit for privileged actions.

No frontend-provided role may grant authorization. Service-to-service identities are separate from end-user identities.

Vision has no Taxi DB role, no Taxi schema role and no Taxi Redis credentials.
