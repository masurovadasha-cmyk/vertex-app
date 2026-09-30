-- Product registration does not enable a module or grant permissions.
-- Apply to development/staging first. No production migration is run by the web build.
begin;
create table public.vision_module_definitions(
 id text primary key check(id ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
 name text not null,
 core_major integer not null default 1 check(core_major=1),
 version text not null default '0.1.0',
 created_at timestamptz not null default now()
);
create table public.vision_module_installations(
 tenant_id uuid not null,
 organization_id uuid not null,
 module_id text not null references public.vision_module_definitions(id),
 state text not null default 'REGISTERED' check(state in ('REGISTERED','ENABLED','SUSPENDED')),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 primary key(tenant_id,organization_id,module_id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id)
);
alter table public.vision_module_definitions enable row level security;
alter table public.vision_module_installations enable row level security;
revoke all on public.vision_module_definitions,public.vision_module_installations from public,anon,authenticated;
grant select on public.vision_module_definitions,public.vision_module_installations to authenticated;
-- Definitions are non-sensitive product metadata. Per-organization installations are private.
create policy vision_module_definition_read on public.vision_module_definitions for select to authenticated using(true);
create policy vision_module_installation_read on public.vision_module_installations for select to authenticated
 using(vision_private.permitted(tenant_id,organization_id,'modules.read'));
-- No client INSERT/UPDATE/DELETE or management RPC exists in this release.
insert into public.vision_permissions(code,description) values('modules.read','Read explicitly authorized organization module installations') on conflict(code) do nothing;
insert into public.vision_module_definitions(id,name) values
 ('views','Views Hotel & Apartments'),('managing','Vertex Managing IO'),
 ('real-estate','Vertex Real Estate'),('engineers','Vertex Engineers'),('aura-design','Aura Design Studio'),
 ('travel','Vertex Travel'),('aviation','Vertex Aviation / Авиакасса'),
 ('rent-car','Vertex Rent Car'),('taxi','Vertex Taxi'),('concierge','Concierge Service'),
 ('cleaning','Vertex Cleaning'),('laundry','Vertex Laundry'),('ditalia','D’italia Ristorante'),
 ('market','V-Market / Mini Mart'),('bar','Vertex Bar & Lounge'),
 ('technologies','Vertex Technologies'),('investment','Vertex Investment'),('ventures','Vertex Ventures'),('training','Views Training Center');
commit;
