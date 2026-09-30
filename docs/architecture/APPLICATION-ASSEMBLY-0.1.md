# VERTEX Vision / Application Assembly 0.1

## Purpose

This stage assembles the already reviewed VISION layers into one standalone staging application:

`VISION Hub → Auth bootstrap → Views Operations → PostgreSQL/RLS → Audit/Events`.

It does not merge to master and does not authorize a production release.

## Application routes

- `/` — standalone VERTEX Vision Hub.
- `/views` — stable route that redirects to `/operations/`.
- `/operations/` — authenticated Views Operations workspace.
- `/api/vision/v1/modules` — canonical public module metadata.
- `/api/v1/auth/*` — staging Auth bootstrap.
- `/api/v1/views/*` — staging Views reads and command RPCs.
- `/healthz` — liveness/configuration metadata only.

## Module architecture

Views is the only active module in this release candidate. All other registered Vertex Group directions are Coming Soon.

The Hub reads module state from the canonical `vision/platform/registry.cjs` through the Worker. The browser does not maintain a second independent module registry.

Business modules must depend on VISION Core and communicate through approved APIs/events. A future module must not gain runtime access simply because legacy demo code exists elsewhere in the repository.

## Views vertical slice

The assembled application supports the reviewed first operational flow:

`sign-in → organization scope → dashboard/calendar → create booking → confirm → check-in → check-out → cleaning → quality verification → unit READY`.

Database state, permissions, versions, idempotency and transitions remain server-authoritative.

## Auth and data boundaries

Supabase staging Auth establishes the JWT subject. `vision_auth_context()` resolves the tenant and allowed Views organizations. Access/refresh tokens are memory-only in the browser.

The Operations snapshot deliberately excludes guest identity and finance details. Real payments, owners, documents, messaging and external notifications remain outside this assembly.

## Observability and release boundary

The Worker exposes staging status but never marks itself production ready. Audit/outbox/idempotency remain part of the database flow. The genuine cloud E2E gate reports SKIP when Supabase/Cloudflare staging credentials are absent; this must not be interpreted as cloud verification.

## Verification

The assembly gate runs:

- full existing repository regressions,
- PostgreSQL 17 migrations/RLS,
- Auth + Operations contract tests,
- Chromium journey from standalone Hub through Views workflow,
- Cloudflare Worker dry-run,
- genuine Supabase/Cloudflare E2E only when staging credentials are configured.

Production/master, production routes, and JARVIS remain untouched.
