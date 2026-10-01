# Implementation roadmap

## Phase 0 — Architecture freeze

State machine, contracts, boundaries, data model, ADRs and test invariants. No production.

## Phase 1 — Core persistence

PostgreSQL/PostGIS migrations, repositories, RLS, audit, idempotency, outbox.

## Phase 2 — Ride lifecycle

Quote, request, cancel, state machine, driver offers and reservation constraints.

## Phase 3 — Realtime/dispatch

Redis hot state, H3 membership, location freshness, routing adapter, matching and fallback.

## Phase 4 — Driver/passenger production UX

One-viewport state machine, realtime trip updates, safety, PIN, receipts.

## Phase 5 — Money

Payment adapters, provider webhook verification, ledger settlement, payout projections.

## Phase 6 — Operations

Control Center, support, safety operations, audit search, observability.

## Phase 7 — Vision integration

Contract tests, Service Binding, delegated identity, event consumer, reference-only projections.

## Phase 8 — Production gate

Load/race tests, backup/restore, secrets validation, migration preflight, smoke pack, rollback plan and explicit approval.
