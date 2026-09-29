# Always-on operation

Vertex JARVIS is designed as an event-driven Cloudflare Worker, not a process that must stay running on one PC.

## Current schedules

- Every 15 minutes: `heartbeat` event is written to the Durable Object audit stream.
- 03:00 UTC daily (08:00 Asia/Tashkent): `daily_review_due` event is written.

The first version deliberately does not spend AI tokens on every heartbeat.

## Next production step

After PMS/CRM/finance connectors exist, the daily event will launch a management review that checks:
- arrivals / departures
- occupancy and rate exceptions
- unpaid owner obligations
- cash forecast
- open incidents
- overdue staff tasks
- fleet status
- legal/compliance deadlines
- sales pipeline
- owner acquisition pipeline

High-risk findings create approval requests rather than external actions.

## Reliability

Cloudflare can invoke the Worker even while founders' PCs are off. A local PC agent, if added later, is an optional execution node for desktop-only tasks and is never the sole brain.
