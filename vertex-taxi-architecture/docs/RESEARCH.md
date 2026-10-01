# Research and rationale

## Yandex Go

Public Yandex engineering material describes taxi order processing as an asynchronous workflow, with a state machine whose actions depend on the current order state. This supports the decision that the passenger request returns quickly while backend processing continues independently of the mobile session.

Source: https://habr.com/ru/companies/yandex/articles/596681/

## Uber

Uber describes its marketplace as real-time matching and geospatial infrastructure, including H3 hexagonal indexing and matching that accounts for traffic/geography rather than simply choosing the closest driver.

Sources:
- https://www.uber.com/us/en/marketplace/matching/
- https://www.uber.com/tz/en/blog/visualizing-city-cores-with-h3/

## PostGIS

PostGIS recommends `ST_DWithin` for radius queries because it can use spatial indexes; this is the database-side exact geography filter after H3 candidate discovery.

Source: https://postgis.net/docs/ST_DWithin.html

## Redis Streams

Redis documents Streams + consumer groups as an ordered, durable event log with acknowledgement, pending entries, replay and recovery. Pub/Sub is at-most-once and should not be the sole transport for events that cannot be lost.

Sources:
- https://redis.io/docs/latest/develop/use-cases/streaming/
- https://redis.io/docs/latest/develop/data-types/streams/

## Cloudflare

Cloudflare recommends Service Bindings for Worker-to-Worker communication; they avoid a public network hop and allow independent deployment/release cycles.

Sources:
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

## Vertex conclusion

The resulting design is intentionally a modular monolith rather than premature microservices. The boundaries are strict enough that high-load components can later be extracted without changing the public domain contracts.
