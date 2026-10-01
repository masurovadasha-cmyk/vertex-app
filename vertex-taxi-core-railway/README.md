# Vertex Taxi Core — Railway Staging

Standalone Taxi Core for Vertex Taxi. It is intentionally separate from VERTEX Vision.

Runtime:
- PostgreSQL: durable quotes, rides, offers, outbox, audit.
- Redis: driver presence, H3 membership, offer leases and realtime pub/sub.
- H3 v4: spatial candidate generation.
- WebSocket: ride realtime channel.

Real payments and production dispatch remain disabled in staging.
