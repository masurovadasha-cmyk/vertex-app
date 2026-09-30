# ADR-009: Real Supabase staging Auth and cloud E2E gate

Status: Accepted for VERTEX Vision RC branch

## Decision

A green local or disposable-PostgreSQL test suite is necessary but is not sufficient to
claim that VERTEX Vision works in the real staging topology.

The release process therefore has a dedicated manual cloud gate:
`.github/workflows/vision-cloud-e2e.yml`.

It uses only the GitHub Environment `staging` and verifies the actual integration of:

- Supabase PostgreSQL staging;
- checksum-tracked migrations;
- genuine Supabase Auth access tokens;
- VISION RBAC/session context;
- RLS through direct PostgREST requests;
- the dedicated Cloudflare Worker `vertex-vision-staging`;
- the complete Views booking/check-in/check-out/cleaning/quality workflow.

## Identity model

Six distinct synthetic Auth users are required: guest, Views manager, dispatcher, cleaner,
quality reviewer and auditor. The workflow signs them in through the normal password Auth
endpoint and obtains their real Auth UUIDs. Those UUIDs are then mapped into the synthetic
VISION staging fixture by a trusted database connection.

Reusing one Auth identity for several profiles is forbidden because it would collapse the
authorization boundaries being tested.

The Views cleaner receives only the internal Views cleaning execution permission in the
Views organization. The quality identity receives only the Views cleaning verification
permission there. This allows cloud E2E to prove independent execution and review.

## Database changes

The workflow may apply migrations only to a database URL that is cryptographically
transported over TLS and can be tied to the configured Supabase staging project ref. The
migration runner checks hashes of already-applied migrations and refuses a changed file.

Each cloud E2E run provisions a new synthetic apartment so a failed previous run cannot
leave the next test blocked by OCCUPIED/CLEANING state.

No real guest PII is used.

## E2E proof

The required real-cloud sequence includes:

1. `/readyz` proves migration/schema/RLS/runtime readiness.
2. Server-authoritative contexts are retrieved for manager, cleaner, quality and guest.
3. Guest booking creation is denied.
4. Manager creates a booking and an exact retry is idempotent.
5. A competing booking is rejected on confirmation.
6. A stale-version transition is rejected.
7. Manager completes check-in and check-out.
8. Separate cleaner starts and submits cleaning.
9. Cleaner cannot self-verify.
10. Separate quality identity verifies cleaning.
11. Final booking is COMPLETED and cleaning VERIFIED.
12. Guest direct PostgREST read returns only the linked booking.
13. Cleaner direct PostgREST booking read returns nothing.
14. HTTP request/correlation trace headers remain consistent.

## Secrets

Cloudflare credentials, database URL, synthetic passwords and bearer tokens are never
committed and never written to evidence artifacts. End-user Worker traffic continues to
use only the Supabase publishable key and the user's own bearer token; no service-role key
is deployed to the Worker.

## Release meaning

The repository may contain a fully implemented cloud E2E gate while
`cloudStagingVerified=false`. That flag changes only after a genuine staging run succeeds
and its sanitized evidence is reviewed.

This ADR does not authorize production/master changes.
