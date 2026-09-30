# ADR 002 — ordered, bounded outbox delivery

Status: accepted for development/staging; no external transport enabled.

## Problem

The original lease prevents simultaneous ownership but permits different workers
to deliver successive changes to the same order in reverse order. An unavailable
consumer also causes indefinite retries. Timestamps cannot reliably sequence
transactions. A worker may crash after delivery but before acknowledgment.

## Decision

Keep the modular monolith and PostgreSQL transactional outbox. Golden Flow emits
one event per order version. Migration 0005 materializes and uniquely constrains
`(tenant_id, aggregate_type, aggregate_id, aggregate_version)` from the payload.
Existing event IDs and payloads are preserved. A future workflow emitting multiple
events per version must introduce an explicit event ordinal in a new migration.

Only the earliest unpublished version of each aggregate is eligible for claim.
An active lease, retry delay or quarantine on that version blocks its successors,
but does not block other aggregates. Workers use `FOR UPDATE SKIP LOCKED` and a
60-second lease; ack and nack require the current, unexpired token.

Transient failure delays the next attempt by 5, 10, 20, 40, 80, 160, then 300
seconds. Eight claims exhaust the budget, including crashes without nack. A
permanent failure quarantines immediately. Quarantine never marks an event as
published and is never silently skipped. Only bounded failure categories are
stored, not potentially sensitive exception messages or response bodies.

`backend/outbox.mjs` claims one event immediately before each delivery, requires
explicit durable acceptance, and limits execution count and adapter duration.
The adapter receives an AbortSignal and event ID as its idempotency key. An
ambiguous database ack failure stops the run; it does not trigger an immediate
second send. No HTTP delivery, schedule or browser-callable dispatcher is added.

## Delivery and consumer boundary

This remains **at-least-once**. Ordering applies to successful dispatcher
acceptance, not to late or duplicated effects at a consumer. A timed-out adapter
can finish late if it ignores cancellation. Each durable consumer must atomically
deduplicate `(consumer, event_id)` with its database effects, validate tenant and
event version, and reject or defer out-of-order aggregate versions. External
effects require the destination's own idempotency support. For fan-out, the
adapter must durably persist all destinations before accepting an event.

## Operations

Run with a dedicated NOINHERIT principal granted only EXECUTE on claim, ack and
nack; never table ownership, table writes, an authenticated client grant or an
application service-role key. Database credentials belong outside the repository.
Do not invoke this runner inside an enclosing database transaction: claims must
commit before the adapter runs. Use a direct connection or an autocommit adapter.

Monitor unpublished age, quarantined count, expired leases and attempt count via
an operator-only connection. Quarantine requires investigation of the consumer
and the original immutable event. Recovery is a privileged, reviewed operation:
record the reason and event ID in the operator change log, fix the consumer, then
reset retry metadata for that event. Never edit its payload or fabricate an ack.
No automatic discard or public retry endpoint is provided.

## Validation and limits

Embedded SQL tests cover upgrade with existing data, version ordering, delayed
retry, lease fencing, quarantine, crash exhaustion and role denial. PostgreSQL 17
CI also tests independent workers while a predecessor's claim is uncommitted.
Unit tests cover durable acceptance, timeout, secret-free failure categories and
ambiguous ack failure. End-to-end external delivery remains unverified until a
real durable adapter and staging credentials are configured.

References: [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html)
and [SKIP LOCKED queue semantics](https://www.postgresql.org/docs/17/sql-select.html).
