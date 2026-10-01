# ADR-002 — Persisted ride state machine

Status: Accepted

Ride lifecycle is a durable finite state machine. Commands are validated against current state/version, and state changes are committed with audit and outbox records.

The lifecycle is independent of the mobile session and is recoverable after retries, disconnects or worker restarts.
