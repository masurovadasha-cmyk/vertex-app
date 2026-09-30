# VERTEX Engineers — Canva design

Status: **final reviewed design for Operational Core 0.2**.

## Final design

- Canva design ID: `DAHWtHztFic`
- Title: **VERTEX Engineers — Operational Core 0.2**
- Pages: 8
- View: https://www.canva.com/d/KnvsSIEJmGU8O_C
- Edit: https://www.canva.com/d/bs7dvEr2sd0_uwV
- Project folder: https://www.canva.com/folder/FAHWtJs7miI
- Superseded generated versions are stored in the Canva `Drafts` subfolder.

## Audit status

The final design was manually corrected after AI generation. The saved version aligns with the current standalone code contract for:

- project stages and transition behavior
- elevator asset fields
- HVAC/MEP asset fields
- work-order types, priorities, statuses and completion requirements
- exact HTTP API routes
- runtime-emitted vs contract-reserved domain events
- PostgreSQL/RLS status as source-controlled design contracts only
- event outbox status as schema-only in 0.2
- future VERTEX Vision boundary

The design intentionally does **not** claim that PostgreSQL/RLS/outbox are deployed, does **not** claim live Safe Lift/regulator integration, and does **not** claim that VERTEX Engineers has been merged into VERTEX Vision.

## Code/design synchronization

The canonical machine-readable design reference is:

`ui/design-manifest-v0.2.json`

The canonical UI/API mapping is:

`ui/screens-v0.2.json`

The branch for the combined code + design result is:

`vertex-engineers-operational-0.2`

Production/master is not modified by this design integration.
