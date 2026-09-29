# Vertex on Cloudflare

## Current production release: 1.9-demo

Published and verified on 2026-09-29.

- Worker: `vertex-app`
- Account: `b3aa874550f12baee308e3e7b4dba309`
- Public URL: https://vertex-app.masurovadasha.workers.dev
- Production source: `vertex/dist`
- Production branch: `master`
- Cloudflare Workers Build ID: `f0ac2859-2c9c-49fe-a0af-85290a8edb13`
- Cloudflare Worker version ID: `15430952-3c36-44ed-a27b-0a0e41d3b09c`
- Public `/release.json`: verified as `1.9-demo`

## Deployment path

Vertex uses the existing **Cloudflare Workers Static Assets** Worker. Do not create a
second Worker or Pages project.

Cloudflare's Git integration deploys pushes to `master`. The known-good repository
shape is intentionally simple:

- npm is the package manager used by Workers Builds;
- no `pnpm-lock.yaml` or `pnpm-workspace.yaml` in the repository root;
- `package.json` pins Wrangler and provides tests/build scripts;
- `wrangler.jsonc` contains only the Worker name, compatibility date and
  `./vertex/dist` static-assets directory.

The failure that left production on 1.6 was introduced when pnpm-specific root files
and an expanded Wrangler configuration were added. Restoring the npm path and the
minimal proven Wrangler configuration returned Workers Builds to success without
rolling back Vertex 1.9 functionality.

## Verification

For each release:

1. Run `npm test`.
2. Run `npm run sync:android` and verify no Android asset drift.
3. Run `npm run check:deploy`.
4. Merge only verified changes to `master`.
5. Require the GitHub check `Workers Builds: vertex-app` to succeed.
6. Fetch https://vertex-app.masurovadasha.workers.dev/release.json and verify it
   matches `vertex/dist/release.json`.

A separate GitHub Actions deployment that requires `CLOUDFLARE_API_TOKEN` is not
needed while the Cloudflare Git integration is healthy.

## Boundaries

This Worker publishes the web application only. Real payments, OTA synchronization,
production authentication, cross-device sync and OpenAI are separate backend
integrations and are not implied by a successful static-assets deploy.

Vertex JARVIS is a different project and must never be deployed through
`vertex-app`.
