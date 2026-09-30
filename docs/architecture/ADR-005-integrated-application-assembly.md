# ADR-005: Integrated application assembly and release gate

Status: Accepted for VERTEX Vision RC branch

## Decision

VERTEX Vision is assembled and verified as one product release composed of:
- the VISION Hub and canonical module registry;
- VISION Core identity/access/reliability contracts;
- the active Views operational UI and backend;
- PostgreSQL migrations and RLS/integrity rules;
- the public web build and Android web payload;
- separate Cloudflare production and staging Worker configurations.

The assembly contract is stored in `vision/assembly/manifest.json` and verified by
`vision/tools/verify-assembly.mjs`. A release candidate must not be considered coherent
if any of these surfaces disagree on module state, version, migration level, runtime
identity or deployment boundary.

## Non-negotiable boundaries

- Views is the only active business module in this RC.
- The other 18 registry entries remain Coming Soon.
- JARVIS is a separate project and may integrate only through an external API contract.
- Production approval is not implied by a green assembly build.
- Production database migrations are not run by build or verification jobs.
- Staging and production Workers must have different names/configurations.

## Assembly gate

The integrated CI runs:
1. canonical build;
2. assembly contract verification;
3. full regression suite;
4. PostgreSQL RLS/integrity/transaction tests;
5. desktop/mobile browser checks;
6. Android web-payload equality;
7. Cloudflare production dry-run;
8. Cloudflare staging dry-run;
9. evidence packaging with source SHA and manifest hashes.

The APK signing/build job remains a separate release gate because native Android setup is
expensive and has its own evidence. The assembly gate verifies that the exact generated web
payload synchronized to Android is the same application surface.

## Why this exists

Individual green tests are insufficient if they validate different assumptions. The
assembly manifest makes the release topology explicit and machine-checkable: one platform,
one active module, one ordered migration chain, known runtime identities and fail-closed
production boundaries.

## Next extension

Real Supabase staging Auth and cloud database application remain separate gates. When they
are connected, the assembly manifest must record the verified staging project identity,
migration checksum set and authenticated E2E evidence without exposing secrets.
