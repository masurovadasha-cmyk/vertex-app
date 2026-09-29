# Vertex JARVIS

Autonomous management layer for Vertex Group.

This folder is intentionally isolated from the public Vertex App UI. It is a production-oriented foundation for an AI operating brain that can research, reason, coordinate specialist agents, keep an audit trail, and operate within explicit authority limits.

## Design principles

- **Principals:** only the two configured owner identities may issue strategic commands.
- **Wide autonomy, bounded authority:** routine operations may be automated; legal, banking, employment, ownership, tax filing, debt, and high-value commitments require human approval.
- **No secrets in Git:** API keys, bank credentials, passkeys, EDS/private signing keys, and owner tokens are never committed.
- **Law-aware:** legal/tax questions force live-source research and should prioritize official Uzbek sources.
- **Auditable:** every command, model response, approval, and future external action is logged.
- **Fail-safe:** if authorization, confidence, data quality, or policy checks fail, JARVIS switches to recommendation-only mode.
- **Model-portable:** model choice is environment-configurable.

## Initial runtime

Cloudflare Worker + Durable Object state + OpenAI Responses API.

Endpoints:
- `GET /health`
- `GET /v1/status`
- `POST /v1/commands`
- `POST /v1/approvals`

The initial build does **not** execute bank transfers, sign documents, terminate staff, submit tax returns, or mutate third-party systems. It prepares and audits decisions so connectors can be added one by one behind approval policies.

## Local / Cloudflare setup

1. Create a separate Cloudflare Worker named `vertex-jarvis`.
2. Add the secrets:
   - `OPENAI_API_KEY`
   - `JARVIS_OWNER_TOKEN`
3. Optional vars:
   - `OPENAI_MODEL` (default in code: `gpt-6-astra`)
   - `JARVIS_ENV` = `dev|staging|production`
4. Deploy with:
   `npx wrangler deploy --config vertex-jarvis/wrangler.jsonc`

See `SECURITY.md`, `ARCHITECTURE.md`, and `cloudflare/DEPLOY.md` before production use.
