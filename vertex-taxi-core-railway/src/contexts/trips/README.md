# Trips bounded context

Owns the authoritative ride lifecycle and ride-command state machine.

## Owns
- ride state transitions
- optimistic version checks for ride commands
- transactional ride outbox/audit writes
- terminal-trip lease release orchestration

## Does not own
- geo/presence
- dispatch candidate selection
- pricing/quotes
- payment ledger
- notification delivery

HTTP adapters must call the application service rather than reimplementing transition rules.
