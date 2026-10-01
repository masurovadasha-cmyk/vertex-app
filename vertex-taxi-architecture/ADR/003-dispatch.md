# ADR-003 — H3 discovery + PostGIS filter + ETA ranking

Status: Accepted

Use H3 for geographic bucketing, PostGIS for exact geographic filtering, routing/ETA for road-aware ranking, and a versioned matcher with greedy fallback.

Reservation truth remains in durable state and database constraints, not in the matcher or frontend.
