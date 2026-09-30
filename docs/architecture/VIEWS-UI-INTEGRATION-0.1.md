# VERTEX Vision / Views Operations UI 0.1

## Status and boundaries

This is an implementation increment on the verified source snapshot `7e0306813b2313d90f8be49c38d25a1f5eab2838`, not a declaration of a production release. The public product build and root `wrangler.jsonc` are not changed. JARVIS remains separate. Use a review branch and staging only; do not merge into master or apply cloud migrations without the owner's separate production approval.

## Runtime

`vision/wrangler.jsonc` runs `backend/operations-worker.mjs`. It serves an allowlisted static shell from `vision/ui/operations/` at `/operations/`. All original command routes delegate to the existing staging backend. Only an explicitly configured Supabase staging project and a publishable key are accepted. The user's verified bearer token is preserved for Postgres RLS. No service-role key, mock profile switcher, local database runtime or customer data is shipped as an asset.

The initial connection screen accepts an existing genuine Supabase staging access token plus tenant/organization UUIDs. This is a staging verification interface, NOT finished production sign-in. Tokens are held only in module memory, never cookies, URLs, web storage, logs or service-worker caches. Session changes clear data and abort reads; late responses from older sessions are discarded.

## Database contract

Migration `0008_views_operations_snapshot.sql` adds one read-only `SECURITY INVOKER` RPC. It retains underlying RLS, validates organizational permissions and an exclusive-end date range of 1–31 days, and returns: public module metadata, current subject permissions, unit status counts, a date-filtered booking list and unfinished internal Views cleaning jobs.

Every list is bounded to 200 rows and carries `available`, `total`, `limit` and `truncated`. No list length is misrepresented as the complete count. The aggregate counts refer to the requested organization and authorized dataset. Narrow the date range when bookings are truncated. Unit/cleaning pagination beyond 200 remains a follow-up, not hidden completeness.

Snapshots deliberately omit customer identity and financial columns. Customer provisioning, financial reporting, payments, owners, documents and messaging remain separate pending modules/interfaces. Booking creation uses a pre-provisioned synthetic customer UUID, not invented guest records.

## User journey

Authenticate test session → Vision Hub → Views → Overview / Calendar / Bookings / Cleaning. Only Views can open an operational workspace. All other directions are Coming Soon. Internal Views cleaning remains available without activating the separate Vertex Cleaning module.

Booking commands: create, confirm, check-in, check-out, cancel. Cleaning commands: start, submit, verify. Buttons reflect returned permissions and current server status; the database remains authoritative. No optimistic status/financial changes are used.

An uncertain response to a mutation is NOT reported as failure with a fresh retry. The exact immutable command, expected version and idempotency key are retained in memory. New writes are blocked until an explicit replay resolves the original outcome. No automatic write retries, offline write queue or background execution.

## Existing release blockers carried forward

The previous backend's assignment-level cleaning isolation, independent-verifier enforcement, booking/date/payment policies, production authentication, backup/restore checks, full cloud E2E, real notifications and finance completeness are not claimed by this UI increment. A successful local test is not evidence of Cloudflare deployment or genuine Supabase Auth integration.

## Verification commands

```sh
npm test
node --test vision/tests/operations-*.test.mjs
npx wrangler deploy --config vision/wrangler.jsonc --dry-run
```

Cloud staging migration order is `0001` through `0008`; applied files remain immutable. `/healthz` is liveness/configuration only and always reports `productionReady:false`. It is not a database readiness claim.

## Deployment gate

First: source/CI review, migration checksum review, isolated staging database, genuine test identities, verified RLS and end-to-end booking/cleaning flow. Then: Cloudflare staging deployment and actual URL/version verification. Production remains blocked pending separate owner approval and the outstanding release checks. A static UI response alone must never be reported as a working cloud CRM.
