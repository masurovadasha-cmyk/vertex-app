# ADR-007: Typed Views command contract

Status: Accepted for VERTEX Vision RC branch

## Decision

Every Views mutation crossing the staging HTTP boundary must satisfy a versioned,
allowlisted command contract before it can reach PostgreSQL.

The v1 transport contract is implemented in
`vision/modules/views/command-contract.mjs` and currently covers exactly:

- `create_booking`
- `confirm_booking`
- `check_in`
- `check_out`
- `cancel_booking`
- `cleaning_start`
- `cleaning_submit`
- `cleaning_verify`

Each command has an exact set of required/optional fields. Unknown fields are rejected.
Identifiers, idempotency keys, dates, versions, currency and monetary values are validated
at the API boundary.

## Security and correctness model

Transport validation is not authorization. After passing the command contract, the same
payload enters the PostgreSQL RPC where VISION independently checks:

- verified actor;
- tenant and organization scope;
- module installation and release state;
- exact permission;
- idempotency receipt;
- optimistic version;
- booking/cleaning state transition;
- inventory conflicts;
- independent quality rules;
- transactional audit/outbox writes.

The two layers intentionally overlap. API validation protects the transport surface and
makes malformed requests deterministic; PostgreSQL remains the source of business truth.

## Why exact fields

Permissive JSON commands are difficult to evolve safely. An accidental `admin`,
`status`, `role`, `price_override` or similarly named field must not be silently
forwarded to a privileged function, even if today's SQL happens to ignore it.

Breaking command changes require a new contract version rather than silently changing the
meaning of v1.

## Future modules

Every activated business module must publish its own command contract and register it with
the Application Kernel. Coming Soon modules expose no mutation contract.

Production remains gated on real staging Auth/database E2E and explicit approval.
