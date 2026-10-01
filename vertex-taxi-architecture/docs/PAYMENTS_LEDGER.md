# Payments / Ledger

Money uses integer minor units and configured ISO currency rules.

Double-entry append-only ledger:

```text
Receivable      DEBIT   36,800
Driver Payable  CREDIT  31,280
Vertex Revenue  CREDIT   5,520
```

Every posting must balance: sum(debits) = sum(credits). Corrections are reversal + corrected transaction, never mutation of historical ledger rows.

Payment providers are adapters. Provider callbacks require idempotency keys/provider event IDs and cannot directly change ride state outside a command boundary.
