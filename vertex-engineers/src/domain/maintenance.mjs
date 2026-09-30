export const WORK_ORDER_TYPES = Object.freeze([
  "preventive",
  "corrective",
  "emergency",
  "inspection",
  "commissioning"
]);

export const WORK_ORDER_PRIORITIES = Object.freeze(["low", "normal", "high", "critical"]);

export const WORK_ORDER_STATUSES = Object.freeze([
  "open",
  "assigned",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled"
]);

const transitions = Object.freeze({
  open: new Set(["assigned", "scheduled", "cancelled"]),
  assigned: new Set(["scheduled", "in_progress", "cancelled"]),
  scheduled: new Set(["assigned", "in_progress", "cancelled"]),
  in_progress: new Set(["completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set()
});

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

export function createWorkOrder(input) {
  const type = input.type ?? "corrective";
  const priority = input.priority ?? "normal";
  if (!WORK_ORDER_TYPES.includes(type)) throw new Error("Invalid work order type");
  if (!WORK_ORDER_PRIORITIES.includes(priority)) throw new Error("Invalid work order priority");

  return {
    id: required(input.id, "id"),
    tenant_id: required(input.tenant_id, "tenant_id"),
    organization_id: required(input.organization_id, "organization_id"),
    asset_id: required(input.asset_id, "asset_id"),
    type,
    priority,
    status: "open",
    requested_at: required(input.requested_at, "requested_at"),
    assigned_team_id: null,
    technician_ids: [],
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    resolution_summary: null
  };
}

export function transitionWorkOrder(order, nextStatus, patch = {}) {
  if (!WORK_ORDER_STATUSES.includes(nextStatus)) throw new Error("Invalid work order status");
  if (!transitions[order.status]?.has(nextStatus)) {
    throw new Error(`Invalid work order transition: ${order.status} -> ${nextStatus}`);
  }

  const updated = { ...order, ...patch, status: nextStatus };

  if (nextStatus === "assigned") {
    if (!updated.assigned_team_id && !(updated.technician_ids?.length)) {
      throw new Error("Assigned work order needs a team or technician");
    }
  }
  if (nextStatus === "scheduled" && !updated.scheduled_at) {
    throw new Error("Scheduled work order needs scheduled_at");
  }
  if (nextStatus === "in_progress" && !updated.started_at) {
    throw new Error("Work in progress needs started_at");
  }
  if (nextStatus === "completed") {
    if (!updated.completed_at) throw new Error("Completed work order needs completed_at");
    if (!(updated.technician_ids?.length)) throw new Error("Completed work order needs technician_ids");
    if (!updated.resolution_summary) throw new Error("Completed work order needs resolution_summary");
  }

  return updated;
}
