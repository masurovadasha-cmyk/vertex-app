# Vertex JARVIS

Autonomous management layer for Vertex Group.

This folder is intentionally isolated from the public Vertex App UI. It is a production-oriented foundation for an AI operating brain that can research, reason, coordinate specialist agents, keep an audit trail, and operate within explicit authority limits.

## Design principles

- **Principals:** only the two separately authenticated owner identities may issue strategic commands.
- **Wide autonomy, bounded authority:** routine operations may be automated; legal, banking, employment, ownership, tax filing, debt, and high-value commitments require human approval.
- **No secrets in Git:** API keys, bank credentials, passkeys, EDS/private signing keys, and owner tokens are never committed.
- **Law-aware:** legal/tax questions force live-source research and restrict search to official Uzbekistan government/legal domains.
- **Auditable:** every command, model response, source set, approval, kill-switch change, and future external action is logged.
- **Fail-safe:** if authorization, confidence, data quality, or policy checks fail, JARVIS switches to recommendation-only mode.
- **Model router:** Astra for strategic/high-risk work, Sol for normal management, Luna for routine high-volume operations.
- **Kill switch:** either principal can stop external execution immediately while leaving analysis available.

## Runtime

Cloudflare Worker + Durable Object state + OpenAI Responses API.

Endpoints:
- `GET /health`
- `GET /v1/status`
- `GET /v1/memory`
- `POST /v1/memory`
- `POST /v1/commands`
- `POST /v1/approvals`
- `POST /v1/outcomes`
- `GET /v1/kill-switch`
- `POST /v1/kill-switch`

## Authentication

Bootstrap authentication uses separate Cloudflare secrets:
- `JARVIS_FIRDAUS_TOKEN`
- `JARVIS_DARYA_TOKEN`

The API derives the principal identity from the bearer token. A caller cannot simply claim to be the other principal in request JSON.

Production should later move to passkeys / an identity provider while preserving separate principals and revocation.

## Model routing

Defaults:
- `gpt-6-astra` — strategic, legal, red-zone, difficult finance
- `gpt-6-sol` — normal operational management
- `gpt-6-luna` — routine, high-volume green-zone work

All are configurable through Worker variables.

## Current execution boundary

The MVP can think, research, route work, produce recommendations, record approvals, expose sources, and maintain state.

It does **not** yet perform bank transfers, sign documents, terminate staff, submit tax returns, or mutate third-party systems. Each connector will be added behind a policy adapter so permissions stay explicit and auditable.

See `SECURITY.md`, `ARCHITECTURE.md`, `MODEL-ROUTING.md`, and `cloudflare/DEPLOY.md`.


## Learning loop

JARVIS memory is explicit and auditable. Owners can store non-secret company knowledge through `/v1/memory`. Each decision can later receive an outcome through `/v1/outcomes`.

When an outcome is marked `approvedForLearning=true`, a compact outcome record is added to the decision-outcome memory category. This lets future reasoning use real Vertex results without allowing the model to silently rewrite its own constitution or security rules.

Audit records redact common API-key, bearer-token, password, PIN/CVV and private-key patterns.
