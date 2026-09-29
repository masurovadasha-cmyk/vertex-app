# Vertex 1.9-demo — 29 сентября 2026

Vertex 1.9-demo adds the guest operational guide on top of Vertex 1.8.

## Added

- Guest Guide available from the app and mobile profile.
- Arrival-code guidance: access code is sent on the arrival day before 14:00.
- Electric-curtain remote guidance.
- Smoking rule: balcony only where the property has one.
- Quiet-hours guidance: weekdays after 23:00, weekends after 22:00.
- Family stays and extra-bed request.
- Pets by prior approval.
- Ground / underground parking guidance by property and availability.
- Wi-Fi guidance and 24/7 guest assistance.
- Quick requests from the guide for cleaning, laundry, transfer/car and concierge.

## Existing functionality retained

- Uzbekistan stay catalog and dated Airbnb quotes.
- Booking requests, favorites, trips and owner calendar.
- Owner operations dashboard and local property discussions.
- CRM, booking-to-CRM handoff and demo messages/calls.
- Department service routing and travel packages.
- Vertex Mobility and transfer estimator.
- Card / cash / cryptocurrency payment preference with no real processing.
- RU/EN, PWA, Android source and local voice/catalog concierge.

## Production status

Production Cloudflare deployment was repaired on 29.09.2026 without rolling back
Vertex 1.9 functionality.

- GitHub master release: `1.9-demo`.
- Cloudflare Workers Build: success.
- Worker version: `15430952-3c36-44ed-a27b-0a0e41d3b09c`.
- Public URL: https://vertex-app.masurovadasha.workers.dev
- Public `/release.json`: verified as `1.9-demo`.

The root cause of the stale 1.6 production release was the repository build shape:
Workers Builds returned to success after removing pnpm-specific root files and
restoring the minimal known-good Wrangler Static Assets configuration.

## Boundaries

The Guest Guide is a demo instruction layer. Property-specific details remain subject
to the final pre-arrival message. No real payments, OTA sync, OpenAI connection,
production authentication or cross-device synchronization are enabled.

Vertex JARVIS remains a separate project.
