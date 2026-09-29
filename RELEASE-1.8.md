# Vertex 1.8-demo — 29 сентября 2026

Vertex 1.8-demo adds the mobility and checkout-preference layer on top of the stabilized Vertex 1.7 demo.

## Added

- Vertex Mobility section in the guest app.
- Leapmotor C16 fleet card: 7 seats, 2 vehicles, availability by request.
- Leapmotor C01 fleet card: 2 vehicles, availability by request.
- Transfer estimator:
  - up to 5 km: USD 5;
  - above 5 km and up to 10 km: USD 10;
  - above 10 km: USD 10 + USD 1.5 per additional km.
- Transfer estimates can be routed into the existing demo service-request flow.
- Demo checkout now lets the guest record a preferred payment method:
  - bank card;
  - cash;
  - cryptocurrency.
- Payment preference never performs a charge or booking.

## Existing 1.7 functionality retained

- Uzbekistan stay catalog and dated Airbnb reference quotes.
- Local booking requests, favorites and trips.
- Owner calendar, owner operations dashboard and local property discussions.
- CRM and booking-to-CRM handoff.
- Department tasks, service routing and travel packages.
- Real Estate request category.
- RU/EN, PWA, Android source and local voice/catalog concierge.

## Demo boundaries

No real payments, OTA sync, OpenAI/LLM connection, supplier inventory, cross-device synchronization or production authentication are enabled. Vehicle availability and transfer totals are operator-confirmed in real use. Vertex JARVIS is a separate project.
