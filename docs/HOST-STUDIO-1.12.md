# Vertex 1.12-demo — Host Studio

Based on Vertex 1.11-demo / quality1 (PR 23). Vertex JARVIS is not included or modified.

## Video reference
Reviewed the owner's 8m29s recording `ScreenRecording_09-29-2026 15-31-01_1.mp4`.
The source recording contains personal and financial information: neither video nor extracted frames are included in the app, repository, APK, or Canva publication.

| Video area | Implementation in 1.12 | Boundary |
|---|---|---|
| Today / hosting navigation | Five-tab host workspace, arrival/stay/departure filters, booking details | Local demo records |
| Listings / listing editor | Photo cards, search, existing local listing creation and editing, read-only Views catalog | No changes to OTA listings |
| Photo tour | Grid and full-screen previous/next viewer of 16 existing catalog photos | No server upload or image editor |
| Messages | Search, unread/starred filters, stored read markers | Local property discussions; not a real guest inbox |
| Earnings | Month, listing and currency filters; six-month chart; CSV export | Confirmed demo request values, not payments or profit |
| Analytics | Local counts, nights and property breakdown | No guest ratings, external reviews or marketing metrics |
| Account | Display name, language, accessibility preferences, local indicators | No secure accounts, passkeys or cross-device roles |
| Booking | Detail screen and saved host notes | Existing local state machine retained |
| Payments, permissions, company, business travel, tax | Clear connection-status pages | No acquiring, payout, corporate or tax integration |
| Host resources / rules | Routes to the existing guest guide | No fabricated editable global house rules |

## Architecture
- `rental-domain.js` and `rentals.js`: canonical booking, availability, catalog and discussion data.
- `host-domain.js`: pure reporting, CSV escaping, bounded local preference repository.
- `host-console.js`: host UI and navigation; no second booking ledger.
- `host-console.css`, `studio-theme.css`: responsive host and guest visual layers.
- Local preference writes stage a new state and expose it only after storage succeeds. Read errors refuse writes. Corrupt original bytes are backed up before replacement. Capacity errors are not reported as successful saves.
- Reporting uses arrival month and separate currencies. Unknown prices remain explicitly unpriced. Values are summed in integer minor units; this is not an accounting system.
- CSV text is quoted and formula-like values are neutralized. Android exports use ACTION_CREATE_DOCUMENT after a user click; no broad storage permission is requested.
- Existing 52 browser regressions retained; additional studio suite covers navigation, filters, CSV, preferences, save failure and four screen widths.

## Android preview
`com.vertex.studio.preview`, versionCode 16, versionName 1.12-demo, label Vertex Studio.
A separate preview package avoids replacing or requiring removal of the old Vertex app. The old release signing key was not available; CI uses a development/debug signature. Data is not automatically copied between the two packages.

## Not complete production functionality
Real payments, shared backend/accounts, secure role enforcement, OTA sync, AI provider, remote guest messaging, server photo management, external reviews and financial/tax settlement integrations remain unconnected. No production-ready or full Airbnb parity claim is made.
