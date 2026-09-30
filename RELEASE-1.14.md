# Vertex 1.14 — unified journey

Release date: 2026-09-30. Revision: `unified-journey1`. Base: `e4764517a80d46788a87b917c91be7844f121ffc` (published Host Studio and red Vertex Taxi).

The guest journey now combines itinerary dates, a preparation checklist, events, separate currency budgets and service cases. Booking changes and group requests update the shared journey view. Host Studio, the red palette, the owner's C16/C01 taxi fleet, Views catalogue and demo concierge remain available in one application.

Web: https://vertex-app.masurovadasha.workers.dev

Android: https://vertex-app.masurovadasha.workers.dev/Vertex-Latest.apk — package `com.vertex.demo`, version `1.14-demo`, code `18`. The checked local APK uses the original Vertex demo signing certificate; CI-created debug artifacts may use a different certificate.

Canva: https://www.canva.com/d/QSLYbk11KQQ2Khj — design `DAHWq7gBEj8`. The import was confirmed by a design lookup after the transport response was interrupted; it was not imported twice.

## Verification

- Local domain, integration and server tests passed, including itinerary persistence, currency isolation, service case lifecycle, booking notifications and write-failure rollback.
- Release gate: 52 JavaScript files, 38 stylesheets, 2 HTML files, 2 workers, 2 manifests and 220 local references passed.
- Android signature, package version and all 69 embedded web assets matched. No physical-phone installation test was performed.
- Browser checks include saved itinerary after reload, checklist and escaped event text, UZS budget totals with independent USD totals, service case creation/assignment/resolution, and Host Studio calendar. CI runs the existing guest, host, taxi and red-theme browser regression suites.
- Canva HTML SHA-256: `82470fabaab8c60c9e93bcddfe42637166e1afd94b1f04c4a4805492d5f51405`.
- APK SHA-256: `6922325b8ae3a21d57e5a9b36417aef74c0eab4b6f2e3307e1c567fe4065704c`.

## Deployment and boundaries

The existing Cloudflare Git integration published source commit `429adee99ed3cc1b7595ce9ffd09ee149b79fde9` to Worker `vertex-app`. Build `6a8a9c28-e27e-49f7-83d3-a219a96aedc1` succeeded; Worker version `9b6cbcda-f6a3-4748-b212-eef3e9c654f0` was deployed to 100% traffic. All 69 served files, including the APK, matched the Git snapshot by SHA-256. PR validation run `36707708212` and Android build run `36708090013` passed. See the release journals for the detailed evidence.

Requests, payments, taxi dispatch, support cases and team roles are local demonstrations. There is no authenticated production booking/payment/driver backend. The concierge retains its demo fallback and browser voice capabilities; it does not retrain its model automatically. Canva resets demo state on reload; web and Android use local device storage. Observed Views prices retain their original dates and guest counts. No OLX content is included.

The separate VERTEX VISION backend foundation remains development work and is not represented as a deployed production backend in this release.
