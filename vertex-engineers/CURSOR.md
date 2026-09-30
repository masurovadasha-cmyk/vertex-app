# VERTEX Engineers — Cursor Handoff

## Read this first

This file is the canonical handoff for continuing VERTEX Engineers in Cursor.

Project: **VERTEX Engineers**
Current module version: **0.2.0**
Working branch: **vertex-engineers-vision-staging-0.1**
Standalone release branch: **vertex-engineers-release-0.2.0**
VISION staging PR: **#45**
Production/master: **DO NOT MODIFY OR MERGE WITHOUT EXPLICIT OWNER APPROVAL**

## Product definition

VERTEX Engineers is a construction and engineering company within Vertex Group.

Primary business areas:

1. Construction and reconstruction.
2. Elevators:
   - sales;
   - engineering/specification;
   - supply;
   - installation;
   - commissioning;
   - modernization;
   - preventive maintenance;
   - corrective maintenance;
   - emergency service;
   - licensed/certified specialists.
3. HVAC / MEP:
   - ventilation design and installation;
   - heating design and installation;
   - air-conditioning design and installation;
   - equipment selection;
   - commissioning;
   - maintenance.
4. Future engineering areas:
   - electrical;
   - water/sewer;
   - fire safety;
   - BMS/automation;
   - low voltage;
   - other building engineering systems.

## Owner requirement: KEEP IT SIMPLE

The branch must be easy for a normal company team to understand and operate.

Do not turn VERTEX Engineers into an over-engineered platform.

### User-facing architecture

Use these six main areas only:

- Dashboard
- Projects
- Equipment
- Service
- Team
- Documents

### Equipment

Equipment contains simple filters/categories:

- Elevators
- Ventilation
- Heating
- Air Conditioning
- Other

Do not create a separate top-level application for every engineering category.

### Projects

One project page should contain:

- Overview
- Client / site
- Stage
- Estimate
- Equipment
- Tasks / work orders
- Documents
- Timeline / history

Project stages remain:

lead → survey → design → estimate → contract → procurement → installation → qa_qc → commissioning → handover → warranty_maintenance

The UI should translate these technical states into clear human labels.

### Service

One service center for all engineering equipment:

- New request
- Assigned
- Scheduled
- In progress
- Completed

Types:

- preventive
- corrective
- emergency
- inspection
- commissioning

Do not make separate service engines for elevators and HVAC unless a future requirement proves it necessary.

### Team

One specialist directory:

- name
- role
- specialties
- licenses/certificates
- validity/expiry
- assigned work

### Documents

One document center:

- contracts
- estimates
- drawings/design
- licenses
- certificates
- inspection documents
- commissioning documents
- service reports

Compliance should be a capability/status inside Team, Equipment and Documents rather than a confusing separate product for ordinary users.

## Simple technical architecture

Keep four layers:

1. UI
2. Application/API
3. Domain
4. Persistence/Integration

Recommended shape:

vertex-engineers/
  src/
    domain/
      project.mjs
      assets.mjs
      maintenance.mjs
      compliance.mjs
    application/
      engineers-service.mjs
    http/
      handler.mjs
    adapters/
      memory-repository.mjs
      postgres/
  database/
  contracts/
  ui/
  tests/
  docs/
  release/

Rules:

- No microservices.
- No event bus infrastructure inside this module yet.
- No duplicated business rules in UI.
- No direct access to private VERTEX Vision tables.
- Keep IDs and contracts stable.
- Add abstraction only when a real second implementation requires it.
- Prefer one clear service over many tiny services.
- Prefer readable code over clever code.
- Keep files small enough to understand, but do not split files mechanically.

## Current implemented core

Implemented and tested:

- project lifecycle;
- elevator asset model;
- HVAC/MEP asset model;
- engineering asset base;
- work-order lifecycle;
- compliance expiry-state calculation;
- event contracts;
- standalone HTTP API;
- tenant_id + organization_id isolation;
- in-memory repository for tests/demo;
- PostgreSQL schema contract;
- PostgreSQL RLS design contract;
- event outbox schema;
- product reference catalog;
- Canva design manifest;
- VERTEX Vision staging registration.

## Current API

Base:

/api/v1/engineers

Routes:

GET /health
GET /projects
POST /projects
POST /projects/{projectId}/stage
GET /assets
POST /assets/elevators
POST /assets/hvac
POST /assets/{assetId}/commission
GET /work-orders
POST /work-orders
POST /work-orders/{workOrderId}/transition
GET /product-references

Operational scope headers:

x-tenant-id
x-organization-id

Important: these scope headers are not authentication. VERTEX Vision staging must map scope from verified identity before real activation.

## VERTEX Vision integration

VISION already had the module ID `engineers` as planned metadata.

Current staging branch upgrades that registration to:

- module version 0.2.0;
- backend = local-tested;
- cloudEnabled = false;
- registration only;
- no automatic installation;
- no ENABLED state;
- no role permission grants;
- no production database deployment.

VISION mount prepared:

/engineers

Integration must remain through:

- versioned API;
- domain events;
- permissions/RLS;
- tenant_id;
- organization_id.

Do not couple Engineers to VISION private implementation.

## Current verified status

Latest green staging run:

https://github.com/masurovadasha-cmyk/vertex-app/actions/runs/36777490867

Results:

- Engineers standalone: 14 / 14 pass
- Engineers ↔ VISION integration: 5 / 5 pass
- Full VISION: 87 pass / 0 fail / 1 skip
- PostgreSQL isolation: 12 / 12 pass
- Root release check: pass
- Cloudflare VISION dry-run: pass
- Boundary assertions: pass

Draft PR:

https://github.com/masurovadasha-cmyk/vertex-app/pull/45

PR must remain draft/not merged until explicit owner approval.

## Canva

Final reviewed operational design:

Title: VERTEX Engineers — Operational Core 0.2
Canva design ID: DAHWtHztFic

View:
https://www.canva.com/d/KnvsSIEJmGU8O_C

Edit:
https://www.canva.com/d/bs7dvEr2sd0_uwV

Use Canva as visual direction, but the owner's new priority is simplicity and usability. Simplify screens if necessary while preserving the VERTEX premium industrial identity.

## Product reference data

Reference equipment catalog contains public manufacturer examples.

These are REFERENCE ONLY.

Never claim:
- partnership;
- dealership;
- authorization;
- guaranteed local availability.

Verify manufacturer/local documentation before procurement.

## Uzbekistan compliance context

The project contains a compliance research snapshot.

Important principles:

- requirements change;
- store rule version, source and verification date;
- do not hard-code legal conclusions into business logic;
- re-check official requirements before real installation, tender or commissioning.

## Next implementation priority

### P0 — Simplify UI contract

Refactor UI navigation to:

Dashboard
Projects
Equipment
Service
Team
Documents

Map existing technical screens into these six areas.

Do not remove underlying domain capabilities.

### P1 — PostgreSQL repository adapter

Implement persistent repositories for:

- projects;
- assets;
- work orders.

Keep the same application service interface used by memory-repository.

Do not connect production.

### P2 — Verified identity scope adapter

Create an adapter interface that receives verified identity from VERTEX Vision staging and derives:

tenant_id
organization_id
permissions

Do not trust client-supplied role or organization selection.

### P3 — Staging E2E

Test:

Create Project
→ Register Elevator/HVAC Asset
→ Commission Asset
→ Create Work Order
→ Assign Specialist
→ Start
→ Complete
→ Verify history/event/audit boundary

### P4 — Mobile-friendly engineer workflow

Technician view should be extremely simple:

Today
My Jobs
Job Details
Start
Checklist
Photo/evidence placeholder
Complete
Resolution

Do not build a separate mobile backend.

## Definition of done for next RC

- simple six-area UI contract;
- persistent staging adapter;
- identity/scope adapter;
- green Engineers tests;
- green VISION tests;
- green PostgreSQL isolation;
- staging E2E;
- no production changes;
- PR remains reviewable;
- documentation matches actual code.

## Do not do

- Do not merge PR #45 automatically.
- Do not modify production/master without explicit owner approval.
- Do not deploy Engineers to production.
- Do not enable Engineers for an organization automatically.
- Do not add fake business data.
- Do not claim external partnerships.
- Do not mix VERTEX JARVIS into this repository/module.
- Do not split VERTEX Engineers into unnecessary microservices.
- Do not redesign stable contracts without migration/versioning.

## Owner intent

The result should feel like a simple operating system for a construction/engineering company:

**project → equipment → service → specialist → document/history**

A manager should understand it without technical training.
A field engineer should be able to use it quickly from a phone.
The architecture should stay simple enough for a small development team to maintain.
