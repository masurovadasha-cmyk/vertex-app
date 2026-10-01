# Dispatch / Matching

```text
Ride request
  ↓ H3 pickup cell
neighbor rings / supply discovery
  ↓ eligibility
PostGIS exact-radius filter
  ↓ routing/ETA matrix
ranking
  ↓ reservation
offer → accept / decline / timeout
  ↓
redispatch
```

Eligibility: online/available, market, service-class compatibility, valid documents, safety/compliance clear, no active reservation/trip, fresh location.

Ranking must consider pickup ETA and real road constraints rather than raw distance alone. Candidate score is versioned.

Fallback: optimized/batch matcher → greedy matcher → wider H3 ring → controlled no-driver result. Matcher does not own reservation truth; durable state and database/lock constraints do.
