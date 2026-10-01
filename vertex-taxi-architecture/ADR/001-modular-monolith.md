# ADR-001 — Modular monolith first

Status: Accepted

Start as a modular monolith with hard bounded contexts. Extract a context into a separate service only when scale, ownership or failure isolation proves the need.

Hard module boundaries preserve future extraction while avoiding premature distributed transactions and operational complexity.
