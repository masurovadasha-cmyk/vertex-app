# Deploy Vertex JARVIS as a separate Cloudflare Worker

Target Worker name: **vertex-jarvis**

Keep it separate from the existing `vertex-app` static Worker until the backend is proven.

## Required secrets

Set these through Cloudflare / Wrangler. Never commit them:

```
npx wrangler secret put OPENAI_API_KEY --config vertex-jarvis/wrangler.jsonc
npx wrangler secret put JARVIS_FIRDAUS_TOKEN --config vertex-jarvis/wrangler.jsonc
npx wrangler secret put JARVIS_DARYA_TOKEN --config vertex-jarvis/wrangler.jsonc
```

The two owner tokens must be different and high entropy.

## Deploy

```
npx wrangler deploy --config vertex-jarvis/wrangler.jsonc
```

## Smoke test

Public health:

```
curl https://vertex-jarvis.<account-subdomain>.workers.dev/health
```

Owner status:

```
curl -H "Authorization: Bearer $JARVIS_FIRDAUS_TOKEN" \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/status
```

Test a command:

```
curl -X POST \
  -H "Authorization: Bearer $JARVIS_FIRDAUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"Give me today’s Vertex management priorities and identify the three largest risks.","allowWebResearch":true}' \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/commands
```

Emergency stop:

```
curl -X POST \
  -H "Authorization: Bearer $JARVIS_FIRDAUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stopped":true,"reason":"Owner emergency stop"}' \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/kill-switch
```

## Production hardening before third-party write access

- Replace bootstrap bearer tokens with passkeys / identity-provider authentication.
- Add rate limiting and abuse controls.
- Add signed connector requests.
- Add explicit connector allowlists and minimal scopes.
- Enforce two-key approval in every adapter that can move money or create a material commitment.
- Add monitoring, alerts, backups and audit export.
- Store payment/signing secrets in dedicated vaults.
- Keep EDS/private signing keys outside the AI runtime.
