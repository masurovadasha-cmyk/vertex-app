-- VERTEX VISION FOUNDATION 0.1
-- PostgreSQL/Supabase-compatible schema. Apply to development/staging first.
begin;
-- gen_random_uuid() is built into supported PostgreSQL 13+; no extension needed.

create table if not exists vision_tenants(
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 created_at timestamptz not null default now()
);
create table if not exists vision_organizations(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 parent_id uuid references vision_organizations(id), code text not null, name text not null,
 kind text not null check(kind in ('GROUP','COMPANY','BRANCH','DEPARTMENT','PROPERTY','LOCATION')),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 created_at timestamptz not null default now(), unique(tenant_id,code)
);
create table if not exists vision_users(
 id uuid primary key, tenant_id uuid not null references vision_tenants(id), display_name text not null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INVITED','SUSPENDED')),
 created_at timestamptz not null default now()
);
create table if not exists vision_memberships(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 user_id uuid not null references vision_users(id), organization_id uuid not null references vision_organizations(id),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','PENDING','SUSPENDED')),
 created_at timestamptz not null default now(), unique(user_id,organization_id)
);
create table if not exists vision_roles(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 code text not null, name text not null, unique(tenant_id,code)
);
create table if not exists vision_permissions(
 id uuid primary key default gen_random_uuid(), code text not null unique, description text not null default ''
);
create table if not exists vision_role_permissions(
 role_id uuid not null references vision_roles(id) on delete cascade,
 permission_id uuid not null references vision_permissions(id) on delete cascade,
 primary key(role_id,permission_id)
);
create table if not exists vision_membership_roles(
 membership_id uuid not null references vision_memberships(id) on delete cascade,
 role_id uuid not null references vision_roles(id) on delete cascade,
 primary key(membership_id,role_id)
);
create table if not exists vision_customers(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 display_name text not null, status text not null default 'ACTIVE', created_at timestamptz not null default now()
);
create table if not exists vision_services(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 code text not null, name text not null, provider_organization_id uuid not null references vision_organizations(id),
 status text not null default 'ACTIVE', created_at timestamptz not null default now(), unique(tenant_id,code)
);
create table if not exists vision_orders(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 public_no text not null, customer_id uuid not null references vision_customers(id),
 requester_organization_id uuid not null references vision_organizations(id),
 provider_organization_id uuid not null references vision_organizations(id),
 service_id uuid not null references vision_services(id),
 status text not null check(status in ('NEW','ACCEPTED','IN_PROGRESS','QUALITY','COMPLETED','CANCELLED')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
 version bigint not null default 1, idempotency_key text not null,
 created_by uuid not null references vision_users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(tenant_id,public_no), unique(tenant_id,idempotency_key)
);
create table if not exists vision_order_status_history(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 order_id uuid not null references vision_orders(id), from_status text, to_status text not null,
 actor_user_id uuid not null references vision_users(id), reason text, created_at timestamptz not null default now()
);
create table if not exists vision_tasks(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 order_id uuid not null references vision_orders(id), organization_id uuid not null references vision_organizations(id),
 title text not null, status text not null check(status in ('NEW','ASSIGNED','IN_PROGRESS','WAITING','QUALITY','COMPLETED','CANCELLED')),
 assigned_user_id uuid references vision_users(id), due_at timestamptz, version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists vision_audit_events(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 organization_id uuid references vision_organizations(id), actor_user_id uuid references vision_users(id),
 action text not null, entity_type text not null, entity_id uuid, request_id uuid not null,
 correlation_id uuid not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists vision_outbox_events(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references vision_tenants(id),
 event_type text not null, event_version int not null default 1, aggregate_type text not null,
 aggregate_id uuid not null, correlation_id uuid not null, payload jsonb not null,
 created_at timestamptz not null default now(), published_at timestamptz, attempts int not null default 0
);
create index if not exists idx_vision_orders_tenant_status on vision_orders(tenant_id,status,created_at desc);
create index if not exists idx_vision_tasks_assignee_status on vision_tasks(tenant_id,assigned_user_id,status);
create index if not exists idx_vision_outbox_pending on vision_outbox_events(created_at) where published_at is null;
create index if not exists idx_vision_audit_entity on vision_audit_events(tenant_id,entity_type,entity_id,created_at desc);

-- RLS is enabled now; policies must be installed with authenticated server identity before live use.
alter table vision_tenants enable row level security;
alter table vision_organizations enable row level security;
alter table vision_users enable row level security;
alter table vision_memberships enable row level security;
alter table vision_customers enable row level security;
alter table vision_services enable row level security;
alter table vision_orders enable row level security;
alter table vision_tasks enable row level security;
alter table vision_audit_events enable row level security;
alter table vision_outbox_events enable row level security;
commit;

