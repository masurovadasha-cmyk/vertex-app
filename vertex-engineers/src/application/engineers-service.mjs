import { createProject, advanceProject } from "../domain/project.mjs";
import { createElevatorAsset, createHvacAsset, commissionAsset } from "../domain/assets.mjs";
import { createWorkOrder, transitionWorkOrder } from "../domain/maintenance.mjs";
import { buildEngineersEvent } from "../events/event-factory.mjs";

function sameScope(a, b) {
  return a.tenant_id === b.tenant_id && a.organization_id === b.organization_id;
}

function assertScope(context, entity) {
  if (!sameScope(context, entity)) throw new Error("Tenant/organization boundary violation");
}

export function createEngineersService({ repository, eventSink }) {
  if (!repository) throw new Error("repository is required");
  const emit = async (event) => eventSink?.publish?.(event);

  async function requireProject(projectId, context) {
    const project = await repository.projects.get(projectId, context);
    if (!project) throw new Error("Project not found");
    assertScope(context, project);
    return project;
  }

  return {
    async createProject(input, eventContext) {
      const project = createProject(input);
      assertScope(eventContext, project);
      await repository.projects.put(project);
      await emit(buildEngineersEvent("engineers.project.created", eventContext, {
        project_id: project.id,
        client_id: project.client_id,
        project_type: project.type
      }));
      return project;
    },

    async advanceProject(projectId, toStage, occurredAt, eventContext) {
      const project = await requireProject(projectId, eventContext);
      const updated = advanceProject(project, toStage, occurredAt);
      await repository.projects.put(updated);
      await emit(buildEngineersEvent("engineers.project.stage_changed", eventContext, {
        project_id: project.id,
        from_stage: project.stage,
        to_stage: updated.stage
      }));
      return updated;
    },

    async registerElevator(input, eventContext) {
      await requireProject(input.project_id, eventContext);
      const asset = createElevatorAsset(input);
      assertScope(eventContext, asset);
      await repository.assets.put(asset);
      return asset;
    },

    async registerHvac(input, eventContext) {
      await requireProject(input.project_id, eventContext);
      const asset = createHvacAsset(input);
      assertScope(eventContext, asset);
      await repository.assets.put(asset);
      return asset;
    },

    async commissionAsset(assetId, occurredAt, registration, eventContext) {
      const asset = await repository.assets.get(assetId, eventContext);
      if (!asset) throw new Error("Asset not found");
      assertScope(eventContext, asset);
      const updated = commissionAsset(asset, occurredAt, registration);
      await repository.assets.put(updated);
      await emit(buildEngineersEvent("engineers.asset.commissioned", eventContext, {
        project_id: updated.project_id,
        asset_id: updated.id,
        asset_type: updated.category,
        commissioned_at: updated.commissioned_at
      }));
      return updated;
    },

    async createWorkOrder(input, eventContext) {
      const asset = await repository.assets.get(input.asset_id, eventContext);
      if (!asset) throw new Error("Asset not found");
      assertScope(eventContext, asset);
      const order = createWorkOrder(input);
      assertScope(eventContext, order);
      await repository.workOrders.put(order);
      await emit(buildEngineersEvent("engineers.maintenance.requested", eventContext, {
        asset_id: order.asset_id,
        work_order_id: order.id,
        priority: order.priority
      }));
      return order;
    },

    async transitionWorkOrder(orderId, nextStatus, patch, eventContext) {
      const order = await repository.workOrders.get(orderId, eventContext);
      if (!order) throw new Error("Work order not found");
      assertScope(eventContext, order);
      const updated = transitionWorkOrder(order, nextStatus, patch);
      await repository.workOrders.put(updated);

      if (nextStatus === "completed") {
        await emit(buildEngineersEvent("engineers.maintenance.completed", eventContext, {
          asset_id: updated.asset_id,
          work_order_id: updated.id,
          technician_ids: updated.technician_ids,
          completed_at: updated.completed_at
        }));
      }
      return updated;
    }
  };
}
