# Red web + Vertex Taxi

Base: verified Host Studio master `205621415a796738f35ab7e4f354eb7c01351c50`.
This revision preserves Host Studio reporting, filters, photos, account preferences and all existing tests. It does not merge the outdated red branch.

## Red palette
`brand-red.css` is the final brand adapter; `studio-theme.css` no longer overrides it with sand. Red: #e51d57; surfaces: white / neutral; text: #222. Semantic booking statuses remain distinct. Existing user storage is not cleared. Service-worker cache revision changes to `studio-red-taxi1`.

## In-app taxi
Guest: pickup/destination, C01/C16 selection, manually entered distance, passengers, now/scheduled (explicit Tashkent UTC+5), optional luggage/seat note and payment preference. Fare uses the existing `VertexMobility.quoteTransfer` function, saved in integer USD cents. Waiting, parking and extras are excluded. No charge occurs.

History: local request records survive browser reload. Copy explains before submission and after save that nothing is sent to a driver. Demo dispatcher: four logical fleet units (not real license plates), assignment by matching model, busy-vehicle guard, ordered state transitions and cancellation. No fake ETA or GPS vehicle positions. Taxi shortcuts and transfer entry remain inside the application. `?view=taxi` is a direct entry.

## Architecture
- `taxi-domain.js`: validation, schedule normalization, state machine, fleet constraints; no DOM, persistence or network.
- `taxi-store.js`: injectable repository; rejects damaged records and stale sequential writes, commits before exposing successful state. No silent resets or false saves. This is not cross-device or concurrent server storage.
- `taxi.js` / `taxi.css`: presentation and application orchestration. Input rendered as escaped text. Public facade deliberately exposes `liveDispatch:false`.

## Production boundary
All taxi requests and dispatcher controls are local demo functionality. No driver accounts, protected dispatcher roles, common database, GPS/routing provider, payment or push/SMS delivery is connected. Do not collect real passenger data in the public demo. For real operations: confirmed dispatcher and driver accounts, fleet registration, service areas/hours, fare and extra-fee rules, secured API/database, route provider and notifications must be configured. JARVIS is unchanged.

## Tests
`node --test vertex/tools/taxi.test.cjs`
`python scripts/browser-taxi.py` (routed HTTPS origin with real browser storage)
`python scripts/browser-web-red.py` (read-only UI palette)
`python scripts/browser-web-red.py --live` (read-only deployed revision, screenshots)
Retain the full unit, server, static, Android parity, baseline and studio browser suites. Passing local tests does not itself prove publication.
