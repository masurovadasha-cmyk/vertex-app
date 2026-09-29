# Deploy Vertex JARVIS as a separate Cloudflare Worker

Target Worker name: **vertex-jarvis**

Keep it separate from the public `vertex-app` static Worker until the backend is proven.

## Preflight

From the repository root:

```bash
npm install
npm run jarvis:check
```

The dry run must pass before deployment.

## Required secrets

Set interactively or in the Cloudflare dashboard:

```bash
npx wrangler secret put OPENAI_API_KEY --config vertex-jarvis/wrangler.jsonc
npx wrangler secret put JARVIS_FIRDAUS_TOKEN --config vertex-jarvis/wrangler.jsonc
npx wrangler secret put JARVIS_DARYA_TOKEN --config vertex-jarvis/wrangler.jsonc
```

Use high-entropy independent tokens. Do not reuse a banking, email, GitHub, Cloudflare or OpenAI password/token.

Optional runtime variables are in `wrangler.jsonc`:
- `OPENAI_MODEL`
- `JARVIS_ENV`

For production set `JARVIS_ENV` to `production`.

## Deploy

```bash
npm run jarvis:deploy
```

## Smoke test

Public health endpoint:

```bash
curl https://vertex-jarvis.<account-subdomain>.workers.dev/health
```

Authenticated status with the FIRDAUS credential:

```bash
curl -H "Authorization: Bearer $JARVIS_FIRDAUS_TOKEN" \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/status
```

First controlled command:

```bash
curl -X POST \
  -H "Authorization: Bearer $JARVIS_FIRDAUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"Prepare a cash-flow risk review for this week. Do not take external actions."}' \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/commands
```

## Production hardening before external actions

- Replace bootstrap bearer tokens with passkeys / identity-provider auth.
- Add Cloudflare rate limiting / WAF rules.
- Add credential rotation and revocation.
- Add request signatures for connectors.
- Add explicit connector allowlists and least-privilege scopes.
- Add verified approval lookup and two-key enforcement before any red-zone connector call.
- Add monitoring, alerting and a kill switch.
- Add backup/export for audit records.
- Keep EDS/private signing keys outside the AI runtime.
- Never expose owner tokens in the public Vertex browser app.
