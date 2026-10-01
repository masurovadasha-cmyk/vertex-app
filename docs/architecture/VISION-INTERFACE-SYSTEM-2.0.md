# VERTEX VISION Interface System 2.0

Source design: Canva `DAHWuG0D0xk` — https://www.canva.com/d/2REVo-Km73I52F4

## Runtime integration

This increment translates the approved Tech Sand visual system into the existing VISION shell and the active Views Operations workspace without changing the authoritative backend domain model.

- VISION Hub: graphite/olive-charcoal shell, champagne-metal accent, clearer module hierarchy and explicit product-state chips.
- Views Operations: warm ivory/sand operational workspace with higher contrast, 44px primary controls, stronger semantic status treatment and a bottom navigation pattern on narrow screens.
- Keyboard: `Ctrl/Cmd + K` focuses the VISION module search when no dialog is open.
- Accessibility: visible focus, status not represented by color alone, larger touch targets, reduced-motion support.
- Honest states remain mandatory: unknown values are `—`, disconnected services stay visibly disconnected, and inactive directions remain Coming Soon.

## Product boundaries

Views remains the only ACTIVE RC module. This design work does not activate Real Estate, Engineers, Taxi, Travel or any other future direction. JARVIS, Vertex Taxi and Vertex Engineers remain separate products/codebases and may only integrate through defined contracts.

No production/master mutation, production deployment, cloud database migration or claim of live external provider connectivity is part of this increment.

## Cloudflare preview delivery

This branch uses Cloudflare Worker Previews through the existing `vertex-app` Workers Builds Git integration. The production Worker remains unchanged.

- Production Worker name remains `vertex-app`.
- Non-production branch delivery uses Cloudflare Worker Preview isolation.
- `wrangler.jsonc` explicitly enables `preview_urls` and declares a required `previews` block.
- No production routes, Cron triggers, database bindings, production variables or production secrets are added for the Preview.
- The Preview keeps honest RC behavior: backend-dependent operations remain unavailable until a real staging backend is connected.
- The separate `vertex-vision-staging` GitHub workflow is retained as a manual fallback only; automatic branch delivery uses the already-authorized Cloudflare Workers Builds integration.
