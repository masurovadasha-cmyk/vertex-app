# Passenger one-viewport UX

The application is an app shell, not a scrolling website.

```text
Persistent MapShell
├── top controls
├── pickup marker
├── destination marker
├── route polyline
└── realtime vehicle markers

BottomSheet (state-driven)
├── HOME
├── DESTINATION
├── ROUTE_PREVIEW
├── QUOTE / SERVICE CLASS
├── PAYMENT
├── REQUESTED / SEARCHING
├── DRIVER_ASSIGNED
├── ARRIVED / PIN
├── IN_TRIP
├── COMPLETED
└── RATING
```

The viewport never navigates to another page. Only BottomSheet state and map overlays change.

HOME: From/To, saved places, add stop.
QUOTE: horizontal service-class rail, ETA, upfront fare, payment, promo, comment, order CTA.
SEARCHING: animated search state, cancel and resilient retry.
DRIVER_ASSIGNED: driver/rating, vehicle/plate, ETA, call/chat and safety.
IN_TRIP: ETA, remaining distance, route, share, safety and SOS.
COMPLETED: final amount, payment, receipt, rating and support.
