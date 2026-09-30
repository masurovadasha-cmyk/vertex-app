# VERTEX VISION — Sand Luxury 1.0

Status: owner-approved visual direction implemented in the design branch. This file is not evidence of production deployment or working cloud Auth.
Base: RC source `217e81e0b91d685deb447f9d7339a00b969869c9`, architecture 1.2 / migration 0009.

## Scope of the approval

The owner selected the warm luxury concept and explicitly asked to integrate it into the application, not generate more static mockups. For the VISION Hub and Views Operations this supersedes the older red-only palette instruction. Legacy Host Studio, Taxi and the guest catalog remain separate demo workspaces with their existing behaviour and red identity; this change must not replace their data or remove their controls.

Implemented surfaces: VISION home, search/category filter, 19 module tiles, module detail sheets, real navigation dock, Views Operations header, five tabs, disconnected/loading/error/loaded states, responsive layouts and restrained motion. Other registered divisions receive unique SVG symbols, themed accents and three-step workflow descriptions, not fake operational dashboards. Views remains the only active module. JARVIS is unchanged and separate.

## Visual system

`vision/platform/design-system.js` is presentation-only metadata: trusted inline vector symbols and immutable per-module style descriptions. It does not perform network requests, store guest data, grant roles or change release-state policy.

`sand-luxury.css` is a scoped final palette/layout layer. Core tokens: graphite/olive `#20241f`, ivory `#f5f1e8`, warm paper `#fffcf6`, sand `#e5d8bf`, champagne `#cfb783`, bronze `#716038`, ink `#272922`. Serif headings use system Georgia with fallbacks; operational copy uses system sans-serif. No third-party font file is redistributed.

The dark Hub uses the existing Views catalog photo `views-modern-1.avif`, with a readable gradient. The Views tile uses `views-panoramic-3.avif`. These are catalog visual references, not a claim that every illustrated scene is available to book. The foreign locations, invented revenue, guest identities and resort scenery in AI reference boards are not copied into business data.

Views Operations is light and operational: real server-authoritative session context, no client-granted permissions, no demo fallback. Before connection, metrics are em dashes. Once connected, a visible note explains that loaded rows are not totals for the full portfolio. Pagination completeness and other pre-existing backend/UI gates are not solved merely by styling.

## Interaction and accessibility

Each tile is a real button with text and its existing action contract. Future modules open informational sheets without operational launch buttons. Search filters the actual registry; the dock focuses search/category controls or opens Views. It does not advertise working notifications or messages that are not connected.

At mobile widths only one bottom navigation is shown while the Hub is visible; the legacy navigation returns outside the Hub. Primary hit targets are at least 44 px. Gold focus outlines remain visible; text and status labels are not represented by colour alone. The five Views tabs remain scrollable when space is limited. The header/hero collapses appropriately on short screens.

Entrance lasts 320 ms, selected/hover transitions 160 ms. There are no infinite decorative loops. `prefers-reduced-motion: reduce` disables these transitions and decorative movement. The final entrance transform is `none` so the fixed mobile dock stays relative to the viewport, not the animated Hub. This implementation includes focused accessibility checks, not a blanket WCAG certification.

## Build and verification

`node vision/platform/build.cjs` emits the shared web assets. `node scripts/sync-android.cjs` copies them with the existing native adaptations. The new favicon, theme colours, design identity, cache suffix `sand1` and integrated-assembly hashes are updated together. No backend configuration, migration, authentication or tenant grant is changed by this design build.

Checks: `node --test vision/tests/sand-design.test.cjs`, `python scripts/browser-sand-design.py`, existing platform/browser regression suites, `npm run assemble:vision`, Android asset parity, and both Cloudflare dry-runs. Design browser fixtures are synthetic and screenshots containing them are labelled. Do not interpret those screenshots as real revenue, occupancy or cloud Auth verification.

The Canva/standalone HTML is generated from the exact built UI using `scripts/package-canva.cjs`, not a flattened screenshot. Its old demo workspaces use fresh in-memory data and reset on reload; Views Operations still does not fabricate data. No private credentials or fonts belong in the export. Import as a new Canva design, without deleting prior versions.

## Release boundaries

Merge into RC only after required checks. Do not merge PR #35 into master or publish production because this visual PR passed. Real authenticated staging, migration validation and production approval remain separate. A dry-run or successful Canva import is not Cloudflare publication. The Android payload is synchronized; a new APK is not claimed unless its build, signature and contained resources are separately checked.
