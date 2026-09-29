# Vertex JARVIS production runbook

## Current state

The codebase is ready for Cloudflare bundle validation. Production activation still requires:
1. an authenticated Cloudflare session,
2. a fresh OpenAI project API key stored as a Cloudflare secret,
3. two separate owner tokens,
4. deployment,
5. smoke testing.

Never reuse an API key that has been pasted into chat, tickets, source code, screenshots, or public logs. Revoke it and create a replacement.

## Cloudflare service

Create a separate Worker:
- service: `vertex-jarvis`
- existing `vertex-app`: do not modify
- config: `vertex-jarvis/wrangler.jsonc`

Required secrets:
- `OPENAI_API_KEY`
- `JARVIS_FIRDAUS_TOKEN`
- `JARVIS_DARYA_TOKEN`

Do not store the values in GitHub source.

## First deployment

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler deploy --dry-run --config vertex-jarvis/wrangler.jsonc
pnpm exec wrangler secret put OPENAI_API_KEY --config vertex-jarvis/wrangler.jsonc
pnpm exec wrangler secret put JARVIS_FIRDAUS_TOKEN --config vertex-jarvis/wrangler.jsonc
pnpm exec wrangler secret put JARVIS_DARYA_TOKEN --config vertex-jarvis/wrangler.jsonc
pnpm exec wrangler deploy --config vertex-jarvis/wrangler.jsonc
```

## Verification

Unauthenticated:
```bash
JARVIS_URL=https://vertex-jarvis.<workers-subdomain>.workers.dev \
node vertex-jarvis/scripts/smoke.mjs
```

Authenticated:
```bash
JARVIS_URL=https://vertex-jarvis.<workers-subdomain>.workers.dev \
JARVIS_OWNER_TOKEN='<one owner token>' \
node vertex-jarvis/scripts/smoke.mjs
```

AI round-trip:
```bash
JARVIS_URL=https://vertex-jarvis.<workers-subdomain>.workers.dev \
JARVIS_OWNER_TOKEN='<one owner token>' \
JARVIS_SMOKE_AI=1 \
node vertex-jarvis/scripts/smoke.mjs
```

## 24/7 operation

Cloudflare Workers are event-driven rather than a permanently running desktop process. JARVIS remains reachable continuously and cron triggers record operational heartbeats. The current config schedules:
- heartbeat: every 15 minutes,
- daily review marker: 03:00 UTC.

The daily review marker intentionally does not spend AI tokens by itself yet. A later release will run a reviewed daily management cycle after live business data connectors are attached.

## Incident response

### Suspected key leak
1. Activate JARVIS kill switch if external connectors exist.
2. Revoke the exposed key/token.
3. Create a new secret.
4. Review recent audit events.
5. Run smoke checks.

### Unexpected JARVIS behavior
1. POST `/v1/kill-switch` with `{"stopped":true,"reason":"..."}`.
2. Do not delete audit history.
3. Capture the decision ID and model response ID.
4. Review inputs, sources and policy classification.
5. Fix policy or connector before re-enabling execution.

### Cloudflare outage
JARVIS must fail closed for external writes. Business systems continue independently; staff use normal manual operating procedures until the AI layer recovers.
