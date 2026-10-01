# Redis / H3 model

Redis is hot state only.

Suggested keys:

```text
taxi:driver:{driver_id}:presence
taxi:driver:{driver_id}:location
taxi:h3:{resolution}:{cell}:drivers
taxi:h3:{resolution}:{cell}:demand
taxi:offer:{offer_id}
taxi:reservation:{offer_id}
taxi:ride:{ride_id}:realtime
taxi:stream:domain
taxi:stream:dispatch
taxi:stream:notifications
taxi:lock:{aggregate}:{id}
taxi:rate:{scope}:{subject}
```

Driver location updates update hot state and H3 membership. PostgreSQL receives canonical/periodic location samples according to retention policy; Redis expiry prevents stale drivers from remaining eligible.

Never treat a Redis key as proof that a ride completed, money was paid, or a driver is permanently assigned. Durable state must confirm those facts.
