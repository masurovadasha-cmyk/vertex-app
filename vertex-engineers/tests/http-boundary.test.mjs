import test from "node:test";
import assert from "node:assert/strict";
import { createEngineersService } from "../src/application/engineers-service.mjs";
import { createMemoryRepository, createMemoryEventSink } from "../src/adapters/memory-repository.mjs";
import { createEngineersHttpHandler } from "../src/http/handler.mjs";

function request(path, { method = "GET", body, tenant = "tenant-1", org = "org-engineers", event = "evt-http" } = {}) {
  return new Request(`https://engineers.invalid/api/v1/engineers${path}`, {
    method,
    headers: {
      "content-type":"application/json",
      "x-tenant-id":tenant,
      "x-organization-id":org,
      "x-event-id":event,
      "x-correlation-id":"corr-http"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("HTTP boundary creates scoped project and hides it from another tenant", async () => {
  const repository = createMemoryRepository();
  const service = createEngineersService({repository,eventSink:createMemoryEventSink()});
  const handle = createEngineersHttpHandler({service,repository,moduleVersion:"0.2.0"});

  const created = await handle(request("/projects", {
    method:"POST",
    body:{id:"p-http",client_id:"client-1",name:"Tower engineering",type:"mixed",created_at:"2026-10-01T00:00:00Z"}
  }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).tenant_id, "tenant-1");

  const ownList = await handle(request("/projects"));
  assert.equal((await ownList.json()).items.length, 1);

  const otherList = await handle(request("/projects", {tenant:"tenant-2"}));
  assert.equal((await otherList.json()).items.length, 0);
});

test("HTTP boundary supports elevator registration, commissioning and work-order lifecycle", async () => {
  const repository = createMemoryRepository();
  const sink = createMemoryEventSink();
  const service = createEngineersService({repository,eventSink:sink});
  const handle = createEngineersHttpHandler({service,repository});

  await handle(request("/projects", {
    method:"POST", event:"evt-p",
    body:{id:"p1",client_id:"c1",name:"Elevator project",type:"elevator",created_at:"2026-10-01T00:00:00Z"}
  }));

  const assetResponse = await handle(request("/assets/elevators", {
    method:"POST", event:"evt-a",
    body:{id:"e1",project_id:"p1",status:"installed",manufacturer:"Reference Manufacturer",model:"Reference Model"}
  }));
  assert.equal(assetResponse.status, 201);

  const commissionResponse = await handle(request("/assets/e1/commission", {
    method:"POST", event:"evt-c",
    body:{commissioned_at:"2026-10-02T00:00:00Z",safe_lift_registration_id:"safe-lift-demo"}
  }));
  assert.equal(commissionResponse.status, 200);
  assert.equal((await commissionResponse.json()).status, "commissioned");

  const workOrderResponse = await handle(request("/work-orders", {
    method:"POST", event:"evt-w",
    body:{id:"wo1",asset_id:"e1",type:"preventive",priority:"normal",requested_at:"2026-10-03T00:00:00Z"}
  }));
  assert.equal(workOrderResponse.status, 201);

  let transition = await handle(request("/work-orders/wo1/transition", {
    method:"POST", event:"evt-t1",
    body:{status:"assigned",patch:{technician_ids:["tech-1"]}}
  }));
  assert.equal(transition.status, 200);

  transition = await handle(request("/work-orders/wo1/transition", {
    method:"POST", event:"evt-t2",
    body:{status:"in_progress",patch:{started_at:"2026-10-03T01:00:00Z"}}
  }));
  assert.equal(transition.status, 200);

  transition = await handle(request("/work-orders/wo1/transition", {
    method:"POST", event:"evt-t3",
    body:{status:"completed",patch:{
      completed_at:"2026-10-03T02:00:00Z",
      resolution_summary:"Preventive maintenance completed"
    }}
  }));
  assert.equal(transition.status, 200);

  const eventNames = sink.list().map((event) => event.name);
  assert.ok(eventNames.includes("engineers.asset.commissioned"));
  assert.ok(eventNames.includes("engineers.maintenance.completed"));
});

test("health endpoint is public but operational endpoints require scope headers", async () => {
  const repository = createMemoryRepository();
  const service = createEngineersService({repository,eventSink:createMemoryEventSink()});
  const handle = createEngineersHttpHandler({service,repository});

  const health = await handle(new Request("https://engineers.invalid/api/v1/engineers/health"));
  assert.equal(health.status, 200);

  const projects = await handle(new Request("https://engineers.invalid/api/v1/engineers/projects"));
  assert.equal(projects.status, 400);
  assert.match((await projects.json()).error, /headers are required/);
});
