# Vertex JARVIS

Autonomous management layer for Vertex Group.

This folder is intentionally isolated from the public Vertex App UI. It is a production-oriented foundation for an AI operating brain that can research, reason, coordinate specialist agents, keep an audit trail, and operate within explicit authority limits.

## Design principles

- **Principals:** only the two configured owner identities may issue strategic commands.
- **Credential binding:** FIRDAUS and DARYA use separate runtime credentials; the principal is derived from the credential, not trusted from request JSON.
- **Wide autonomy, bounded authority:** routine analysis and reversible internal work can be automated; legal, banking, employment, ownership, tax filing, debt, and high-value commitments require explicit approval.
- **No secrets in Git:** API keys, bank credentials, passkeys, EDS/private signing keys, owner tokens and recovery codes are never committed.
- **Law-aware:** legal/tax questions force live-source research and prioritize official Uzbekistan sources.
- **Auditable:** every command, model response, approval, error and future external action is logged.
- **Fail-safe:** if authorization, confidence, data quality or policy checks fail, JARVIS switches to recommendation-only mode.
- **Model-portable:** model choice is environment-configurable.
- **No silent self-expansion:** JARVIS cannot grant itself new permissions, change approval thresholds or enable connectors by model output alone.

## Current runtime foundation

Cloudflare Worker + Durable Object state + OpenAI Responses API.

Endpoints:
- `GET /health`
- `GET /v1/status`
- `POST /v1/commands`
- `POST /v1/approvals`

The foundation build does **not** execute bank transfers, sign documents, terminate staff, submit tax returns, send supplier orders, change production inventory, or mutate third-party systems. It prepares and audits decisions so connectors can be added one by one behind explicit approval policies.

## Required Cloudflare secrets

- `OPENAI_API_KEY`
- `JARVIS_FIRDAUS_TOKEN`
- `JARVIS_DARYA_TOKEN`

Optional:
- `OPENAI_MODEL` (default: `gpt-6-astra`)
- `JARVIS_ENV` = `development|staging|production`

A legacy `JARVIS_OWNER_TOKEN` can be used only outside production with an explicit `X-Jarvis-Principal` header. It is for migration/testing only and should not be configured in production.

## Root repository commands

- `npm run jarvis:dev`
- `npm run jarvis:check`
- `npm run jarvis:deploy`

See `SECURITY.md`, `ARCHITECTURE.md` and `cloudflare/DEPLOY.md` before production use.
