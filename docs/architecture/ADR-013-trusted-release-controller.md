# ADR-013: Trusted Release Controller

Status: Accepted for VERTEX Vision RC branch

## Decision

Production promotion is a separate control-plane concern and must not be governed by the
candidate application checkout.

The authoritative promotion workflow is
`.github/workflows/vision-promotion-gate.yml`. A manual evidence evaluation is allowed
only when that workflow is launched from the protected `master` ref.

The trusted controller checkout supplies:
- promotion policy;
- evidence evaluator;
- workflow identity rules;
- action pins.

The candidate is checked out separately by an exact 40-character commit SHA into
`candidate/`. The trusted evaluator reads only the candidate release manifest from that
isolated checkout. The candidate does not supply the promotion policy or evaluator.

## Evidence provenance

Before artifacts are downloaded, the controller queries the GitHub Actions API for every
provided run ID and requires:
- the expected workflow name;
- the expected workflow file path;
- the exact candidate head SHA;
- successful conclusion;
- the same repository.

Only then are Assembly, RC2 Safety, Real Staging Auth E2E and Production Backup/Restore
artifacts downloaded and evaluated.

## Supply-chain controls

Release-evidence workflows pin first-party GitHub Actions by immutable commit SHA.
The repository has a regression test that fails if mutable action tags are reintroduced.

The Android release build is covered by the same pinning policy.

## Backup principal

RC2 creates a synthetic backup principal and runs the same effective-privilege checker used
by the manual production backup workflow. The checker rejects:
- superuser/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS;
- database or application-schema CREATE;
- effective table writes;
- sequence UPDATE;
- EXECUTE on volatile SECURITY DEFINER functions;
- SET ROLE paths into roles with equivalent write/elevation capability;
- sessions that are not transaction-read-only.

## First-release bootstrap limitation

This controller cannot be treated as trusted until its workflow and evaluator exist on the
protected master branch. Therefore the RC branch records the controller as
`implemented-requires-protected-master-controller`, not production-ready.

Merging the controller infrastructure does not authorize application production deployment.
The candidate application, real staging E2E, production backup/restore evidence and explicit
owner approval remain separate gates.

## Production mutation

This ADR creates evidence only. It contains no production deploy step and does not authorize
master merge, database migration or Cloudflare production mutation.
