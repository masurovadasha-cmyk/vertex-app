# Current release evidence

The unified release is **1.14-demo / unified-journey1**, published on 2026-09-30.

Read `cloudflare-release.json`, `canva-release.json`, `android-verification.json`, `source-manifest.json` and `live-verification.json` together. `source-manifest.json` records exact Git blob hashes because Windows working-tree line endings may differ from the Linux Cloudflare checkout.

The old `manifest.json`, `release-summary.json`, generated upload helpers and payloads describe earlier releases and must not be used to republish the application. Current publication uses the existing Cloudflare Git integration from `master`. Before any future release, fetch current master and inspect the live `/release.json`; preserve newer work from other chats.

Documentation-only commits do not require another Canva import or an APK rebuild when `vertex/dist` and Android source remain unchanged. They may trigger an equivalent Cloudflare Git build. Existing designs and old journals are retained as history.
