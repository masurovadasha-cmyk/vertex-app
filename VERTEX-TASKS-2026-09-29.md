# Vertex App — consolidated work register — 29.09.2026

This file consolidates Vertex App requirements from prior ChatGPT/Codex/Work discussions. It is the app-only register.

## Completed in the current demo line

- Unified Uzbekistan guest app.
- 6 confirmed Views property cards / 16 photos.
- Date and guest search.
- Favorites and trips.
- Local demo booking requests.
- Host calendar and availability blocks.
- Guest request status flow.
- CRM clients, notes, demo chat and demo call history.
- Booking-to-CRM handoff.
- Service routing to departments.
- Guest / staff / admin demo task states and assignment.
- Travel packages and task creation.
- Real Estate request category.
- Cleaning, laundry, concierge, engineering, travel/tickets and mobility request flows.
- RU/EN.
- PWA and Android source.
- Local voice/catalog concierge.
- Owner operations dashboard and local property discussions in 1.7.

## Deliberately not represented as live

These require production integrations and are not defects of the 1.7 local demo:

- acquiring / real payments / payouts;
- OpenAI or another LLM;
- Airbnb/Booking channel manager synchronization;
- real ticket issuance;
- real supplier inventory;
- server accounts and secure role-based authentication;
- cross-device synchronization;
- owner P&L / accounting / bank settlement feed;
- SMS/email/push provider integrations;
- production file uploads.

## Release rules

- Do not use OLX.
- Do not convert dated Airbnb observations into permanent nightly rates.
- Do not claim availability that is not confirmed.
- Keep financial/private business materials out of the public guest app.
- Vertex JARVIS is a separate project and must not be added to this repository/application.
