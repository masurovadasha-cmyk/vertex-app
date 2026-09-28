# Vertex on Cloudflare

## Latest release: 1.3-demo

Published and verified on 2026-09-29 (Asia/Tashkent). Wrangler is now pinned to
4.143.0. Active Worker version: `0246ef4b-c9ad-4772-a3a1-e36497875723` at 100%.
All 24 published assets match the release snapshot by SHA-256. Deployment used
Cloudflare MCP for account operations and a short-lived asset session for local
upload; Wrangler OAuth remains separate. See `RELEASE-1.3.md` and
`artifacts/release/cloudflare-release.json` for current results.

The inspection below records the initial setup before that release.

## Product choice

Use **Workers Static Assets** for the existing HTML/CSS/JavaScript demo in
`vertex/dist`. There is no build step, server entry point, or database binding.
The existing `vertex-app` Worker already uses this product, so creating a Pages
project would duplicate hosting. Unknown paths retain the default 404 behavior;
this app does not use a history-based client router.

The Android project produces an APK; Workers hosts the web assets, not the Android
runtime.

The separate `concierge-server` is not part of this deployment. Its JSON file,
in-memory sessions and SSE connection registry require redesign for Workers.
For a future Cloudflare backend, use a Worker API, Durable Objects for live chat
coordination and durable room state, D1 for shared relational records if needed,
and R2 for uploaded files. Do not provision these until the backend needs them.
Simply enabling Node compatibility will not provide durable local disk or shared
process memory. The server README lists additional production requirements.

## Verified account and deployment

Cloudflare MCP inspected these resources on 2026-09-29 (Asia/Tashkent):

- Account: `b3aa874550f12baee308e3e7b4dba309`.
- Worker: `vertex-app`; static assets present, no bindings.
- URL: https://vertex-app.masurovadasha.workers.dev
- workers.dev and preview URLs are enabled.
- Active version: `ec2285c8-e9aa-4d00-9005-bf86b1e4adae` at 100%.
- Deployment timestamp: 2026-09-28 14:49:17 UTC.
- No Pages projects were returned.

These are API inspection results, not a browser smoke test. No new deployment
was made during this setup. Local web files include changes that may differ from
the active version.

## Wrangler

Wrangler 4.142.0 is pinned in `package.json` and `pnpm-lock.yaml`. Configuration
is in `wrangler.jsonc`; its account and Worker match the inspected deployment.
The existing compatibility date is preserved. Only `vertex/dist` is uploaded.

With pnpm available, use:

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm check:deploy
pnpm cf:whoami
pnpm exec wrangler login
pnpm deploy
```

Deployment updates the existing public Worker. Cloudflare MCP authorization is
separate from Wrangler login; the CLI needs its own OAuth login or a scoped API
token supplied securely through the environment. Never put tokens in this file
or Wrangler config.

This workspace has a bundled pnpm executable rather than a global npm/pnpm
command. Its equivalent installation command is:

```powershell
node 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs' install --frozen-lockfile
```

Once installed, commands also work directly through Node:

```powershell
node node_modules/wrangler/bin/wrangler.js dev
node node_modules/wrangler/bin/wrangler.js deploy --dry-run
node node_modules/wrangler/bin/wrangler.js login
node node_modules/wrangler/bin/wrangler.js deploy
```

Validation completed: `wrangler deploy --dry-run` exited successfully and read
14 assets, with no bindings. No generated Env types are needed for this
assets-only JavaScript project. The esbuild/workerd installation scripts are
explicitly allowed in `pnpm-workspace.yaml` and completed successfully.
Local dev was not tested.

## References

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/durable-objects/
- https://developers.cloudflare.com/learning-paths/workers/devplat/intro-to-devplat/
