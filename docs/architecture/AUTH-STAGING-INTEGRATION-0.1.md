# VERTEX Vision / Auth & Supabase Staging Integration 0.1

## Goal
Replace the manual tenant/organization/access-token staging form with a genuine Supabase Auth bootstrap:
email/password -> verified JWT subject -> VISION tenant -> permitted Views organizations -> Operations workspace.

## Security boundaries
- Staging only. Production/master are not changed by this increment.
- Browser never receives a service-role key.
- Password, access token and refresh token are memory-only; no localStorage, sessionStorage, cookies, URLs or logs.
- Tenant and organization are not trusted from user input. They come from `vision_auth_context()` using the verified JWT subject.
- Only `views.*` permissions are exposed to the operations UI.
- Business commands are not automatically retried after an authentication error.

## Server contract
Migration `0009_auth_context.sql` adds `vision_auth_context()` as a SECURITY INVOKER RPC.
It resolves the active `vision_users` row for `request.jwt.claims.sub`, then returns only active memberships/organizations with Views permissions.

Same-origin staging endpoints:
- `POST /api/v1/auth/sign-in`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/context`
- `POST /api/v1/auth/sign-out`

The Worker forwards authentication only to the pinned Supabase staging project with the publishable key. Responses are sanitized.

## UI flow
1. Enter staging email/password.
2. Password field is cleared immediately after submit.
3. Supabase returns a short-lived access token and refresh token.
4. VISION verifies the subject and loads `vision_auth_context()`.
5. One allowed organization opens automatically; multiple allowed organizations require an explicit selection.
6. The operations snapshot and all commands continue to rely on RLS and server-side permission checks.

## Remaining cloud gate
This source integration is not proof of a live Supabase project. Before claiming cloud staging:
- create/connect a dedicated Supabase staging project,
- apply migrations 0001-0009,
- create distinct synthetic Auth users,
- map their Auth UUIDs into `vision_users` / memberships / roles,
- configure the dedicated Cloudflare staging Worker with the project ref, URL and publishable key,
- run the genuine-auth E2E flow and direct RLS checks.

Production remains blocked pending separate approval.
