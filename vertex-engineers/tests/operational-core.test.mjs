import test from "node:test";
import assert from "node:assert/strict";
import { createProject, advanceProject } from "../src/domain/project.mjs";
import { createElevatorAsset, createHvacAsset, commissionAsset } from "../src/domain/assets.mjs";
import { createWorkOrder, transitionWorkOrder } from "../src/domain/maintenance.mjs";
import { complianceState, complianceSummary } from "../src/domain/compliance.mjs";
import { buildEngineersEvent } from "../src/events/event-factory.mjs";
import { createEngineersService } from "../src/application/engineers-service.mjs";
import { createMemoryRepository, createMemoryEventSink } from "../src/adapters/memory-repository.mjs";

const scope = {
  tenant_id: "tenant-1",
  organization_id: "org-engineers",
  event_id: "evt-1",
  correlation_id: "corr-1",
  occurred_at: "2026-10-01T00:00:00Z"
};

test("project lifecycle only advances one controlled stage", () => {
  const project = createProject({
    id:"p1", tenant_id:"tenant-1", organization_id:"org-engineers", client_id:"c1",
    name:"Tower MEP", type:"hvac", created_at:"2026-10-01T00:00:00Z"
  });
  const surveyed = advanceProject(project, "survey", "2026-10-02T00:00:00Z");
  assert.equal(surveyed.stage, "survey");
  assert.throws(() => advanceProject(surveyed, "contract", "2026-10-03T00:00:00Z"), /Invalid project transition/);
});

test("elevator and HVAC assets preserve independent technical fields", () => {
  const elevator = createElevatorAsset({
    id:"e1", tenant_id:"tenant-1", organization_id:"org-engineers", project_id:"p1",
    status:"installed", manufacturer:"Reference Manufacturer", model:"Reference Model",
    capacity_kg:1000, stops:12
  });
  assert.equal(elevator.category, "elevator");
  assert.equal(elevator.capacity_kg, 1000);

  const hvac = createHvacAsset({
    id:"h1", tenant_id:"tenant-1", organization_id:"org-engineers", project_id:"p1",
    category:"ventilation_ahu", airflow_m3h:5000, zone:"Roof AHU"
  });
  assert.equal(hvac.category, "ventilation_ahu");
  assert.equal(hvac.airflow_m3h, 5000);

  const commissioned = commissionAsset(elevator, "2026-10-05T00:00:00Z", {safe_lift_registration_id:"safe-lift-ref"});
  assert.equal(commissioned.status, "commissioned");
  assert.equal(commissioned.safe_lift_registration_id, "safe-lift-ref");
});

test("work orders enforce lifecycle evidence before completion", () => {
  let order = createWorkOrder({
    id:"wo1", tenant_id:"tenant-1", organization_id:"org-engineers", asset_id:"e1",
    type:"emergency", priority:"critical", requested_at:"2026-10-01T01:00:00Z"
  });
  order = transitionWorkOrder(order, "assigned", { technician_ids:["tech-1"] });
  order = transitionWorkOrder(order, "in_progress", { started_at:"2026-10-01T01:10:00Z" });
  assert.throws(() => transitionWorkOrder(order, "completed", { completed_at:"2026-10-01T02:00:00Z" }), /resolution_summary/);
  order = transitionWorkOrder(order, "completed", {
    completed_at:"2026-10-01T02:00:00Z",
    resolution_summary:"Fault resolved and asset returned to service"
  });
  assert.equal(order.status, "completed");
});

test("compliance state is deterministic and jurisdiction-agnostic", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  assert.equal(complianceState({expires_at:"2026-09-30T00:00:00Z"}, now), "expired");
  assert.equal(complianceState({expires_at:"2026-10-15T00:00:00Z"}, now), "expiring");
  assert.equal(complianceState({expires_at:"2027-01-01T00:00:00Z"}, now), "valid");
  assert.deepEqual(
    complianceSummary([
      {expires_at:"2026-09-30T00:00:00Z"},
      {expires_at:"2026-10-15T00:00:00Z"},
      {expires_at:"2027-01-01T00:00:00Z"},
      {}
    ], now),
    {valid:1, expiring:1, expired:1, unknown:1, not_applicable:0}
  );
});

test("event factory enforces public event contract", () => {
  const event = buildEngineersEvent("engineers.project.created", scope, {
    project_id:"p1", client_id:"c1", project_type:"hvac"
  });
  assert.equal(event.name, "engineers.project.created");
  assert.throws(() => buildEngineersEvent("engineers.project.created", scope, {project_id:"p1"}), /client_id/);
});

test("application service rejects cross-tenant access and emits events", async () => {
  const repository = createMemoryRepository();
  const eventSink = createMemoryEventSink();
  const service = createEngineersService({repository,eventSink});

  await service.createProject({
    id:"p1", tenant_id:"tenant-1", organization_id:"org-engineers", client_id:"c1",
    name:"Elevator modernization", type:"elevator", created_at:"2026-10-01T00:00:00Z"
  }, scope);

  await service.registerElevator({
    id:"e1", tenant_id:"tenant-1", organization_id:"org-engineers", project_id:"p1",
    status:"installed", manufacturer:"Reference Manufacturer", model:"Reference Model"
  }, {...scope,event_id:"evt-a"});

  await service.createWorkOrder({
    id:"wo1", tenant_id:"tenant-1", organization_id:"org-engineers", asset_id:"e1",
    type:"preventive", priority:"normal", requested_at:"2026-10-01T01:00:00Z"
  }, {...scope,event_id:"evt-2"});

  await assert.rejects(
    service.advanceProject("p1","survey","2026-10-02T00:00:00Z",{
      ...scope, tenant_id:"other-tenant", event_id:"evt-3"
    }),
    /boundary violation/
  );

  await assert.rejects(
    service.registerHvac({
      id:"h-cross", tenant_id:"other-tenant", organization_id:"org-engineers", project_id:"p1",
      category:"ventilation_ahu"
    }, {...scope,tenant_id:"other-tenant",event_id:"evt-4"}),
    /boundary violation/
  );

  const names = eventSink.list().map((event) => event.name);
  assert.deepEqual(names, ["engineers.project.created","engineers.maintenance.requested"]);
});
