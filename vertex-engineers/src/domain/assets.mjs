export const ASSET_STATUSES = Object.freeze([
  "specified",
  "ordered",
  "delivered",
  "installed",
  "commissioned",
  "in_service",
  "out_of_service",
  "retired"
]);

export const ASSET_CATEGORIES = Object.freeze([
  "elevator",
  "hvac_vrf",
  "hvac_chiller",
  "ventilation_ahu",
  "heating_heat_pump",
  "heating_boiler",
  "other_engineering"
]);

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

function positiveOrNull(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be > 0`);
  return value;
}

export function createEngineeringAsset(input) {
  const status = input.status ?? "specified";
  if (!ASSET_STATUSES.includes(status)) throw new Error("Invalid asset status");
  if (!ASSET_CATEGORIES.includes(input.category)) throw new Error("Invalid asset category");

  return {
    id: required(input.id, "id"),
    tenant_id: required(input.tenant_id, "tenant_id"),
    organization_id: required(input.organization_id, "organization_id"),
    project_id: required(input.project_id, "project_id"),
    category: input.category,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    serial_number: input.serial_number ?? null,
    site_location: input.site_location ?? null,
    commissioned_at: input.commissioned_at ?? null,
    warranty_until: input.warranty_until ?? null,
    status
  };
}

export function createElevatorAsset(input) {
  if (input.category && input.category !== "elevator") throw new Error("Elevator asset category must be elevator");
  return {
    ...createEngineeringAsset({ ...input, category: "elevator" }),
    capacity_kg: positiveOrNull(input.capacity_kg, "capacity_kg"),
    speed_mps: positiveOrNull(input.speed_mps, "speed_mps"),
    stops: positiveOrNull(input.stops, "stops"),
    travel_m: positiveOrNull(input.travel_m, "travel_m"),
    drive_type: input.drive_type ?? null,
    machine_room_type: input.machine_room_type ?? null,
    safe_lift_registration_id: input.safe_lift_registration_id ?? null
  };
}

export function createHvacAsset(input) {
  if (!input.category || input.category === "elevator") {
    throw new Error("HVAC asset requires a non-elevator engineering category");
  }
  return {
    ...createEngineeringAsset(input),
    system_type: input.system_type ?? null,
    cooling_capacity_kw: positiveOrNull(input.cooling_capacity_kw, "cooling_capacity_kw"),
    heating_capacity_kw: positiveOrNull(input.heating_capacity_kw, "heating_capacity_kw"),
    airflow_m3h: positiveOrNull(input.airflow_m3h, "airflow_m3h"),
    refrigerant: input.refrigerant ?? null,
    zone: input.zone ?? null
  };
}

export function commissionAsset(asset, occurredAt, registration = {}) {
  if (!["installed", "commissioned"].includes(asset.status)) {
    throw new Error("Only installed/commissioned assets can enter commissioning");
  }
  if (asset.category === "elevator" && registration.safe_lift_registration_id) {
    asset = { ...asset, safe_lift_registration_id: registration.safe_lift_registration_id };
  }
  return {
    ...asset,
    status: "commissioned",
    commissioned_at: required(occurredAt, "occurredAt")
  };
}
