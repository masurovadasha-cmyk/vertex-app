function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function scopeFromRequest(request, occurredAt = new Date().toISOString()) {
  const tenant_id = request.headers.get("x-tenant-id");
  const organization_id = request.headers.get("x-organization-id");
  if (!tenant_id || !organization_id) {
    throw new Error("x-tenant-id and x-organization-id headers are required");
  }
  const event_id = request.headers.get("x-event-id") ?? crypto.randomUUID();
  return {
    tenant_id,
    organization_id,
    event_id,
    correlation_id: request.headers.get("x-correlation-id") ?? event_id,
    occurred_at: occurredAt
  };
}

function scopedInput(body, context) {
  return {
    ...body,
    tenant_id: context.tenant_id,
    organization_id: context.organization_id
  };
}

function match(pathname, expression) {
  return pathname.match(expression);
}

export function createEngineersHttpHandler({
  service,
  repository,
  productCatalog = { references: [] },
  moduleVersion = "0.2.0"
}) {
  return async function handle(request) {
    const url = new URL(request.url);
    const base = "/api/v1/engineers";
    if (!url.pathname.startsWith(base)) return json({ error: "Not found" }, 404);
    const path = url.pathname.slice(base.length) || "/";

    try {
      if (request.method === "GET" && path === "/health") {
        return json({
          status: "ok",
          module: "engineers",
          version: moduleVersion,
          integration_mode: "detached_until_approved"
        });
      }

      const context = scopeFromRequest(request);

      if (request.method === "GET" && path === "/projects") {
        return json({ items: await repository.projects.list(context) });
      }

      if (request.method === "POST" && path === "/projects") {
        const body = await bodyJson(request);
        const project = await service.createProject(scopedInput(body, context), context);
        return json(project, 201);
      }

      let found = match(path, /^\/projects\/([^/]+)\/stage$/);
      if (request.method === "POST" && found) {
        const body = await bodyJson(request);
        const occurredAt = body.occurred_at ?? context.occurred_at;
        const eventContext = { ...context, occurred_at: occurredAt };
        return json(await service.advanceProject(found[1], body.to_stage, occurredAt, eventContext));
      }

      if (request.method === "GET" && path === "/assets") {
        return json({ items: await repository.assets.list(context) });
      }

      if (request.method === "POST" && path === "/assets/elevators") {
        const body = await bodyJson(request);
        return json(await service.registerElevator(scopedInput(body, context), context), 201);
      }

      if (request.method === "POST" && path === "/assets/hvac") {
        const body = await bodyJson(request);
        return json(await service.registerHvac(scopedInput(body, context), context), 201);
      }

      found = match(path, /^\/assets\/([^/]+)\/commission$/);
      if (request.method === "POST" && found) {
        const body = await bodyJson(request);
        const occurredAt = body.commissioned_at ?? context.occurred_at;
        const eventContext = { ...context, occurred_at: occurredAt };
        return json(await service.commissionAsset(found[1], occurredAt, {
          safe_lift_registration_id: body.safe_lift_registration_id
        }, eventContext));
      }

      if (request.method === "GET" && path === "/work-orders") {
        return json({ items: await repository.workOrders.list(context) });
      }

      if (request.method === "POST" && path === "/work-orders") {
        const body = await bodyJson(request);
        return json(await service.createWorkOrder(scopedInput(body, context), context), 201);
      }

      found = match(path, /^\/work-orders\/([^/]+)\/transition$/);
      if (request.method === "POST" && found) {
        const body = await bodyJson(request);
        return json(await service.transitionWorkOrder(found[1], body.status, body.patch ?? {}, context));
      }

      if (request.method === "GET" && path === "/product-references") {
        return json({
          disclaimer: productCatalog.disclaimer,
          snapshot_date: productCatalog.snapshot_date,
          items: productCatalog.references
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const notFound = /not found/i.test(message);
      return json({ error: message }, notFound ? 404 : 400);
    }
  };
}
