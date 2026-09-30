# VERTEX Engineers

Independent foundation for the VERTEX Engineers construction and engineering company.

## Boundary

This directory is intentionally independent from `vision/` during development. It may follow VERTEX Vision public module conventions, but it must not import private Vision internals or modify Vision production behavior before a separate integration approval.

## Company scope

VERTEX Engineers is designed as a scalable construction + engineering business with these first domains:

- Construction and reconstruction
- Elevators: sales, specification, installation, commissioning, modernization, maintenance and emergency service
- HVAC/MEP: design, supply, installation and service of ventilation, heating and air-conditioning systems
- Projects, estimates, procurement, warehouse and suppliers
- Licensed/certified specialists and qualification records
- Compliance, inspections, commissioning acts and service history
- Preventive and corrective maintenance

Future domains can add electrical systems, water/sewer, fire safety, BMS/automation, low-voltage systems, renewables and other engineering services without redesigning the core.

## Operating lifecycle

Lead -> Survey -> Engineering design -> Estimate -> Contract -> Procurement -> Installation -> QA/QC -> Commissioning -> Handover -> Warranty -> Scheduled maintenance -> Incident/emergency service.

## Initial product reference library

The reference catalog includes public examples from established manufacturers such as Otis, KONE, Schindler, TK Elevator, Daikin, Mitsubishi Electric, Carrier and Systemair. These entries are market/product references only. They do not claim dealership, authorization, partnership, local availability or permission to use third-party trademarks in marketing.

## Uzbekistan compliance baseline

The foundation keeps compliance metadata as a first-class domain. As of the research snapshot dated 2026-10-01:

- Uzbekistan's elevator safety technical regulation UzTR.430-025:2025 is in force from 2026-07-01.
- Newly installed elevators in new construction/multi-apartment buildings are registered through the Safe Lift system.
- The service-provider registry tracks licensing/permit status and specialist information.
- Architectural/urban-planning documentation licensing includes engineering systems such as heating, ventilation and air conditioning, subject to the current requirements of the Ministry of Construction and Housing and Communal Services.

Always re-check official requirements before a real project, tender, installation or commissioning.

## Planned VERTEX Vision integration

The module exposes a stable boundary through:

- `module.json` — VERTEX Vision-compatible module manifest
- `contracts/events-v1.json` — domain events
- `contracts/api-v1.openapi.json` — API surface
- `domain/entities-v1.json` — canonical entities
- `integration/vision-adapter.md` — future mounting rules
- `ui/design-system.json` — navigation and visual tokens

No merge into VERTEX Vision is part of this foundation release.

## Operational Core 0.2

The combined code + design result is maintained on branch `vertex-engineers-operational-0.2`.

- Module version: `0.2.0`
- API base: `/api/v1/engineers`
- Final Canva design: `DAHWtHztFic`
- UI contract: `ui/screens-v0.2.json`
- Design manifest: `ui/design-manifest-v0.2.json`
- Persistence contract: `database/schema-v1.sql` + `database/rls-v1.sql`
- VERTEX Vision status: prepared for future integration; not merged into production/master.

