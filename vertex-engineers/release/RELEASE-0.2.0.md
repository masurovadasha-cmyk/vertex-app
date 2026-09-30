# VERTEX Engineers 0.2.0 — Final Candidate

## Release scope

This build packages the standalone VERTEX Engineers operational core without merging it into VERTEX Vision or production/master.

Included:

- construction / engineering project lifecycle
- elevator asset model and lifecycle
- HVAC / MEP asset model and lifecycle
- maintenance and service work-order engine
- compliance-state calculation
- versioned standalone API under `/api/v1/engineers`
- domain-event contracts
- tenant + organization isolation model
- PostgreSQL schema and RLS design contracts
- UI screen contract
- audited Canva design manifest

## Final Canva

- Design: **VERTEX Engineers — Operational Core 0.2**
- Canva ID: `DAHWtHztFic`
- View: https://www.canva.com/d/KnvsSIEJmGU8O_C
- Edit: https://www.canva.com/d/bs7dvEr2sd0_uwV

The Canva design is referenced from `ui/design-manifest-v0.2.json`.

## Release gates

The release workflow must:

1. run the full Node 22 test suite;
2. run `scripts/release-check.mjs`;
3. create deterministic release staging content;
4. build both `.tar.gz` and `.zip` packages;
5. calculate SHA-256 for files and archives;
6. upload the release bundle as a GitHub Actions artifact.

## Isolation guarantee for this candidate

- VERTEX Vision/master is not merged.
- No production database migration is applied.
- No Cloudflare production deployment is performed for Engineers.
- No private VERTEX Vision source is imported by the Engineers runtime.
- Future integration remains prepared through versioned API/events/permissions boundaries.

## Release branch

`vertex-engineers-release-0.2.0`
