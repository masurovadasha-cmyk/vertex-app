# Deploy Vertex JARVIS as a separate Cloudflare Worker

Target Worker name: **vertex-jarvis**

This must remain separate from the existing `vertex-app` static Worker until the backend is proven.

## Required secrets

Run interactively or set through the Cloudflare dashboard:

```
npx wrangler secret put OPENAI_API_KEY --config vertex-jarvis/wrangler.jsonc
npx wrangler secret put JARVIS_OWNER_TOKEN --config vertex-jarvis/wrangler.jsonc
```

Use a high-entropy owner token for the bootstrap stage. Do not commit it.

## Deploy

```
npx wrangler deploy --config vertex-jarvis/wrangler.jsonc
```

## Smoke test

```
curl https://vertex-jarvis.<account-subdomain>.workers.dev/health
```

Authenticated status:

```
curl -H "Authorization: Bearer $JARVIS_OWNER_TOKEN" \
  https://vertex-jarvis.<account-subdomain>.workers.dev/v1/status
```

## Production hardening before external actions

- Replace bootstrap bearer token with passkey / identity-provider auth.
- Add rate limiting.
- Add per-principal credentials and revocation.
- Add request signatures for connectors.
- Add explicit connector allowlists.
- Add an approval ledger and two-key enforcement for red-zone tools.
- Add monitoring / alerting and a kill switch.
- Add backup/export for audit records.
- Keep EDS/private signing keys outside the AI runtime.
