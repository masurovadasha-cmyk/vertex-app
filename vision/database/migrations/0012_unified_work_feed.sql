-- VERTEX VISION Unified Work Feed 0.1
-- Additive read foundation for My Day / Tasks / Approvals / Attention.
-- No production migration is performed by the build.
begin;

insert into public.vision_permissions(code,description) values
 ('vision.approval.read','Read approval requests assigned to the actor or visible in the organization'),
 ('vision.approval.decide','Reserved permission for future approval decisions; no decision command is exposed in this release')
on conflict(code) do nothing;

create table public.vision_approval_requests(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 kind text not null check(kind ~ '^[a-z][a-z0-9_.-]{1,63}$'),
 title text not null check(length(title) between 1 and 240),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
 assigned_user_id uuid,
 due_at timestamptz,
 entity_type text,
 entity_id uuid,
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,assigned_user_id) references public.vision_users(tenant_id,id)
);

create index vision_approval_queue_idx
 on public.vision_approval_requests(tenant_id,organization_id,status,due_at,created_at desc);
create index vision_approval_assignee_idx
 on public.vision_approval_requests(tenant_id,assigned_user_id,status,created_at desc);

create function vision_private.active_member(t uuid,org uuid,who uuid default vision_private.actor()) returns boolean
language sql stable security definer set search_path='' as $active_member$
 select vision_private.active_actor(t)
   and exists(
     select 1
     from public.vision_memberships m
     join public.vision_organizations o
       on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
     where m.tenant_id=t and m.organization_id=org and m.user_id=who
       and m.status='ACTIVE' and o.status='ACTIVE'
   );
$active_member$;
revoke all on function vision_private.active_member(uuid,uuid,uuid) from public,anon;
grant execute on function vision_private.active_member(uuid,uuid,uuid) to authenticated;

alter table public.vision_approval_requests enable row level security;
revoke all on public.vision_approval_requests from public,anon,authenticated;
grant select on public.vision_approval_requests to authenticated;

create policy vision_approval_read on public.vision_approval_requests
 for select to authenticated using(
   vision_private.active_actor(tenant_id)
   and (
     vision_private.permitted(tenant_id,organization_id,'vision.approval.read')
     or (
       assigned_user_id=vision_private.actor()
       and vision_private.active_member(tenant_id,organization_id)
     )
   )
 );

create function public.vision_work_feed(
 p_tenant uuid,
 p_organization uuid,
 p_limit integer default 50
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
 actor uuid:=vision_private.actor();
 tasks jsonb:='[]'::jsonb;
 approvals jsonb:='[]'::jsonb;
 requests jsonb:='[]'::jsonb;
 attention jsonb:='[]'::jsonb;
begin
 if actor is null or p_tenant is null or p_organization is null
    or p_limit is null or p_limit not between 1 and 100
    or not vision_private.active_actor(p_tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.created_at desc,x.id),'[]'::jsonb)
 into tasks
 from (
   select * from (
     select
       t.id,
       'task'::text as type,
       'core.task'::text as source,
       t.title,
       t.status,
       coalesce(o.priority,'NORMAL')::text as priority,
       t.due_at,
       (t.assigned_user_id=actor) as assigned_to_me,
       t.order_id as source_id,
       t.created_at,
       t.updated_at
     from public.vision_tasks t
     left join public.vision_orders o
       on o.tenant_id=t.tenant_id and o.id=t.order_id
     where t.tenant_id=p_tenant and t.organization_id=p_organization
       and t.status not in ('COMPLETED','CANCELLED')

     union all

     select
       j.id,
       'task'::text,
       'views.cleaning'::text,
       ('Cleaning · '||coalesce(u.unit_number,'—'))::text,
       j.status,
       (case when j.status='INSPECTION' then 'HIGH' else 'NORMAL' end)::text,
       null::timestamptz,
       false,
       j.id,
       j.created_at,
       j.updated_at
     from public.vision_views_cleaning_jobs j
     left join public.vision_views_units u
       on u.tenant_id=j.tenant_id and u.id=j.unit_id
     where j.tenant_id=p_tenant and j.organization_id=p_organization
       and j.status<>'VERIFIED'
   ) raw_tasks
   order by due_at nulls last,created_at desc,id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.created_at desc,x.id),'[]'::jsonb)
 into approvals
 from (
   select
     a.id,
     'approval'::text as type,
     'vision.approval'::text as source,
     a.kind,
     a.title,
     a.status,
     a.priority,
     a.due_at,
     (a.assigned_user_id=actor) as assigned_to_me,
     a.entity_type,
     a.entity_id,
     a.created_at,
     a.updated_at
   from public.vision_approval_requests a
   where a.tenant_id=p_tenant and a.organization_id=p_organization
     and a.status='PENDING'
   order by a.due_at nulls last,a.created_at desc,a.id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb)
 into requests
 from (
   select
     o.id,
     'request'::text as type,
     'core.order'::text as source,
     ('Order '||o.public_no)::text as title,
     o.status,
     o.priority,
     o.id as source_id,
     o.created_at,
     o.updated_at
   from public.vision_orders o
   where o.tenant_id=p_tenant
     and (o.requester_organization_id=p_organization or o.provider_organization_id=p_organization)
     and o.status not in ('COMPLETED','CANCELLED')
   order by o.created_at desc,o.id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_rank desc,x.due_at nulls last,x.created_at desc,x.id),'[]'::jsonb)
 into attention
 from (
   select * from (
     select
       t.id,
       'attention'::text as type,
       'core.task'::text as source,
       t.title,
       'OVERDUE_TASK'::text as reason,
       coalesce(o.priority,'NORMAL')::text as priority,
       case coalesce(o.priority,'NORMAL') when 'CRITICAL' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end as priority_rank,
       t.due_at,
       t.order_id as source_id,
       t.created_at
     from public.vision_tasks t
     left join public.vision_orders o on o.tenant_id=t.tenant_id and o.id=t.order_id
     where t.tenant_id=p_tenant and t.organization_id=p_organization
       and t.status not in ('COMPLETED','CANCELLED')
       and t.due_at is not null and t.due_at<now()

     union all

     select
       a.id,
       'attention'::text,
       'vision.approval'::text,
       a.title,
       'OVERDUE_APPROVAL'::text,
       a.priority,
       case a.priority when 'CRITICAL' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end,
       a.due_at,
       a.id,
       a.created_at
     from public.vision_approval_requests a
     where a.tenant_id=p_tenant and a.organization_id=p_organization
       and a.status='PENDING' and a.due_at is not null and a.due_at<now()

     union all

     select
       o.id,
       'attention'::text,
       'core.order'::text,
       ('Order '||o.public_no)::text,
       'HIGH_PRIORITY_REQUEST'::text,
       o.priority,
       case o.priority when 'CRITICAL' then 4 else 3 end,
       null::timestamptz,
       o.id,
       o.created_at
     from public.vision_orders o
     where o.tenant_id=p_tenant
       and (o.requester_organization_id=p_organization or o.provider_organization_id=p_organization)
       and o.status not in ('COMPLETED','CANCELLED')
       and o.priority in ('HIGH','CRITICAL')

     union all

     select
       j.id,
       'attention'::text,
       'views.cleaning'::text,
       ('Cleaning inspection · '||coalesce(u.unit_number,'—'))::text,
       'CLEANING_INSPECTION'::text,
       'HIGH'::text,
       3,
       null::timestamptz,
       j.id,
       j.created_at
     from public.vision_views_cleaning_jobs j
     left join public.vision_views_units u on u.tenant_id=j.tenant_id and u.id=j.unit_id
     where j.tenant_id=p_tenant and j.organization_id=p_organization and j.status='INSPECTION'
   ) raw_attention
   order by priority_rank desc,due_at nulls last,created_at desc,id
   limit p_limit
 ) x;

 return jsonb_build_object(
   'generated_at',now(),
   'tasks',tasks,
   'approvals',approvals,
   'attention',attention,
   'requests',requests,
   'counts',jsonb_build_object(
     'tasks',jsonb_array_length(tasks),
     'approvals',jsonb_array_length(approvals),
     'attention',jsonb_array_length(attention),
     'requests',jsonb_array_length(requests)
   )
 );
end $$;

revoke all on function public.vision_work_feed(uuid,uuid,integer) from public,anon;
grant execute on function public.vision_work_feed(uuid,uuid,integer) to authenticated;

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 latest text;
 migration_count integer;
 tables_ok boolean;
 functions_ok boolean;
 rls_ok boolean;
 views_release_active boolean;
 ready boolean;
begin
 select max(name),count(*)::int into latest,migration_count
 from vision_private.schema_migrations;

 tables_ok:=
   to_regclass('public.vision_views_bookings') is not null
   and to_regclass('public.vision_views_units') is not null
   and to_regclass('public.vision_views_cleaning_jobs') is not null
   and to_regclass('public.vision_views_inventory_nights') is not null
   and to_regclass('public.vision_module_definitions') is not null
   and to_regclass('public.vision_approval_requests') is not null;

 functions_ok:=
   to_regprocedure('public.vision_views_command(jsonb)') is not null
   and to_regprocedure('public.vision_session_context(uuid,uuid)') is not null
   and to_regprocedure('public.vision_work_feed(uuid,uuid,integer)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;

 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights','vision_approval_requests');

 select exists(
   select 1 from public.vision_module_definitions
   where id='views' and release_state='ACTIVE'
 ) into views_release_active;

 ready:=latest='0012_unified_work_feed.sql'
   and migration_count>=12
   and tables_ok
   and functions_ok
   and rls_ok
   and views_release_active;

 return jsonb_build_object(
   'ready',ready,
   'latest_migration',latest,
   'migration_count',migration_count,
   'tables_ok',tables_ok,
   'functions_ok',functions_ok,
   'rls_ok',rls_ok,
   'views_release_active',views_release_active,
   'architecture_version','1.7'
 );
end $$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
