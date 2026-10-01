# ADR-004 — Integer money + double-entry ledger

Status: Accepted

All financial values are integer minor units. Financial history is append-only double-entry ledger data. Payment callbacks are idempotent commands.

Corrections use reversal + corrected transaction; historical ledger rows are never mutated.
