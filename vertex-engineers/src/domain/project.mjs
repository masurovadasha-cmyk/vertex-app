export const PROJECT_STAGES = Object.freeze([
  "lead",
  "survey",
  "design",
  "estimate",
  "contract",
  "procurement",
  "installation",
  "qa_qc",
  "commissioning",
  "handover",
  "warranty_maintenance"
]);

export const PROJECT_STATUSES = Object.freeze([
  "active",
  "on_hold",
  "cancelled",
  "completed"
]);

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

export function createProject(input) {
  const stage = input.stage ?? "lead";
  const status = input.status ?? "active";

  if (!PROJECT_STAGES.includes(stage)) throw new Error("Invalid project stage");
  if (!PROJECT_STATUSES.includes(status)) throw new Error("Invalid project status");
  if (input.budget !== undefined && (!Number.isFinite(input.budget) || input.budget < 0)) {
    throw new Error("Project budget must be a non-negative number");
  }

  return {
    id: required(input.id, "id"),
    tenant_id: required(input.tenant_id, "tenant_id"),
    organization_id: required(input.organization_id, "organization_id"),
    client_id: required(input.client_id, "client_id"),
    name: required(input.name, "name"),
    type: required(input.type, "type"),
    site_address: input.site_address ?? null,
    status,
    stage,
    budget: input.budget ?? null,
    currency: input.currency ?? null,
    start_date: input.start_date ?? null,
    target_date: input.target_date ?? null,
    manager_user_id: input.manager_user_id ?? null,
    created_at: required(input.created_at, "created_at"),
    updated_at: required(input.updated_at ?? input.created_at, "updated_at")
  };
}

export function canAdvanceProject(fromStage, toStage) {
  const from = PROJECT_STAGES.indexOf(fromStage);
  const to = PROJECT_STAGES.indexOf(toStage);
  return from >= 0 && to === from + 1;
}

export function advanceProject(project, toStage, occurredAt) {
  if (project.status !== "active") {
    throw new Error("Only active projects can advance");
  }
  if (!canAdvanceProject(project.stage, toStage)) {
    throw new Error(`Invalid project transition: ${project.stage} -> ${toStage}`);
  }
  return { ...project, stage: toStage, updated_at: required(occurredAt, "occurredAt") };
}

export function setProjectStatus(project, status, occurredAt) {
  if (!PROJECT_STATUSES.includes(status)) throw new Error("Invalid project status");
  if (project.status === "completed" && status !== "completed") {
    throw new Error("Completed projects cannot be reopened by this foundation workflow");
  }
  return { ...project, status, updated_at: required(occurredAt, "occurredAt") };
}
