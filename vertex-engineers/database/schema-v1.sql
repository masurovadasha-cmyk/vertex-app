-- VERTEX Engineers standalone PostgreSQL schema v1
-- No VERTEX Vision private tables are referenced.
-- Scope isolation is represented by tenant_id + organization_id on every business table.

create table if not exists engineers_projects (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  client_id text not null,
  name text not null,
  type text not null,
  site_address text,
  status text not null check (status in ('active','on_hold','cancelled','completed')),
  stage text not null check (stage in ('lead','survey','design','estimate','contract','procurement','installation','qa_qc','commissioning','handover','warranty_maintenance')),
  budget numeric,
  currency text,
  start_date date,
  target_date date,
  manager_user_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, organization_id, id),
  check (budget is null or budget >= 0)
);

create table if not exists engineers_assets (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  project_id text not null,
  category text not null check (category in ('elevator','hvac_vrf','hvac_chiller','ventilation_ahu','heating_heat_pump','heating_boiler','other_engineering')),
  manufacturer text,
  model text,
  serial_number text,
  site_location text,
  commissioned_at timestamptz,
  warranty_until date,
  status text not null check (status in ('specified','ordered','delivered','installed','commissioned','in_service','out_of_service','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, organization_id, id),
  foreign key (tenant_id, organization_id, project_id)
    references engineers_projects (tenant_id, organization_id, id)
);

create table if not exists engineers_elevator_assets (
  tenant_id text not null,
  organization_id text not null,
  asset_id text not null,
  capacity_kg numeric,
  speed_mps numeric,
  stops integer,
  travel_m numeric,
  drive_type text,
  machine_room_type text,
  safe_lift_registration_id text,
  primary key (tenant_id, organization_id, asset_id),
  foreign key (tenant_id, organization_id, asset_id)
    references engineers_assets (tenant_id, organization_id, id) on delete cascade,
  check (capacity_kg is null or capacity_kg > 0),
  check (speed_mps is null or speed_mps > 0),
  check (stops is null or stops > 0),
  check (travel_m is null or travel_m > 0)
);

create table if not exists engineers_hvac_assets (
  tenant_id text not null,
  organization_id text not null,
  asset_id text not null,
  system_type text,
  cooling_capacity_kw numeric,
  heating_capacity_kw numeric,
  airflow_m3h numeric,
  refrigerant text,
  zone text,
  primary key (tenant_id, organization_id, asset_id),
  foreign key (tenant_id, organization_id, asset_id)
    references engineers_assets (tenant_id, organization_id, id) on delete cascade,
  check (cooling_capacity_kw is null or cooling_capacity_kw > 0),
  check (heating_capacity_kw is null or heating_capacity_kw > 0),
  check (airflow_m3h is null or airflow_m3h > 0)
);

create table if not exists engineers_work_orders (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  asset_id text not null,
  type text not null check (type in ('preventive','corrective','emergency','inspection','commissioning')),
  priority text not null check (priority in ('low','normal','high','critical')),
  status text not null check (status in ('open','assigned','scheduled','in_progress','completed','cancelled')),
  requested_at timestamptz not null,
  assigned_team_id text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  resolution_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, organization_id, id),
  foreign key (tenant_id, organization_id, asset_id)
    references engineers_assets (tenant_id, organization_id, id)
);

create table if not exists engineers_technicians (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  user_id text,
  name text not null,
  specialties jsonb not null default '[]'::jsonb,
  employment_status text not null default 'active',
  primary key (tenant_id, organization_id, id)
);

create table if not exists engineers_work_order_technicians (
  tenant_id text not null,
  organization_id text not null,
  work_order_id text not null,
  technician_id text not null,
  primary key (tenant_id, organization_id, work_order_id, technician_id),
  foreign key (tenant_id, organization_id, work_order_id)
    references engineers_work_orders (tenant_id, organization_id, id) on delete cascade,
  foreign key (tenant_id, organization_id, technician_id)
    references engineers_technicians (tenant_id, organization_id, id)
);

create table if not exists engineers_compliance_documents (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  subject_type text not null,
  subject_id text not null,
  document_type text not null,
  issuer text,
  number text,
  issued_at date,
  expires_at date,
  status text,
  file_ref text,
  jurisdiction text,
  rule_version text,
  source_url text,
  verified_at timestamptz,
  primary key (tenant_id, organization_id, id)
);

create table if not exists engineers_inspections (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  asset_id text not null,
  type text not null,
  inspector_id text,
  performed_at timestamptz not null,
  result text not null,
  findings text,
  next_due_at timestamptz,
  primary key (tenant_id, organization_id, id),
  foreign key (tenant_id, organization_id, asset_id)
    references engineers_assets (tenant_id, organization_id, id)
);

create table if not exists engineers_suppliers (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  name text not null,
  categories jsonb not null default '[]'::jsonb,
  country text,
  contacts jsonb not null default '{}'::jsonb,
  approval_status text not null default 'pending',
  primary key (tenant_id, organization_id, id)
);

create table if not exists engineers_procurement_orders (
  tenant_id text not null,
  organization_id text not null,
  id text not null,
  project_id text not null,
  supplier_id text not null,
  status text not null,
  currency text,
  total numeric,
  ordered_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,
  primary key (tenant_id, organization_id, id),
  foreign key (tenant_id, organization_id, project_id)
    references engineers_projects (tenant_id, organization_id, id),
  foreign key (tenant_id, organization_id, supplier_id)
    references engineers_suppliers (tenant_id, organization_id, id),
  check (total is null or total >= 0)
);

create table if not exists engineers_event_outbox (
  tenant_id text not null,
  organization_id text not null,
  event_id text not null,
  name text not null,
  schema_version integer not null,
  correlation_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  published_at timestamptz,
  attempts integer not null default 0,
  primary key (tenant_id, organization_id, event_id)
);

create index if not exists engineers_projects_scope_stage_idx
  on engineers_projects (tenant_id, organization_id, stage);

create index if not exists engineers_assets_scope_project_idx
  on engineers_assets (tenant_id, organization_id, project_id);

create index if not exists engineers_work_orders_scope_status_idx
  on engineers_work_orders (tenant_id, organization_id, status, priority);

create index if not exists engineers_compliance_expiry_idx
  on engineers_compliance_documents (tenant_id, organization_id, expires_at);

create index if not exists engineers_outbox_unpublished_idx
  on engineers_event_outbox (tenant_id, organization_id, published_at, occurred_at);
