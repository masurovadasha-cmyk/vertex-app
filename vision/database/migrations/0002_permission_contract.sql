begin;
create schema if not exists vision_private;
revoke all on schema vision_private from public;
-- On plain PostgreSQL the gateway roles must be provisioned by the operator.
-- Supabase already provides anon/authenticated. Never give either SQL login access.

-- Composite keys enforce tenant integrity even for privileged importers.
do $$
declare t text; edge text[];
begin
  foreach t in array array['organizations','users','memberships','roles','customers','services','orders','tasks'] loop
    execute format('alter table public.vision_%I add unique (tenant_id,id)',t);
  end loop;
  foreach edge slice 1 in array array[
    ['organizations','parent_id','organizations'],
    ['memberships','user_id','users'],['memberships','organization_id','organizations'],
    ['services','provider_organization_id','organizations'],
    ['orders','customer_id','customers'],['orders','requester_organization_id','organizations'],
    ['orders','provider_organization_id','organizations'],['orders','service_id','services'],['orders','created_by','users'],
    ['tasks','order_id','orders'],['tasks','organization_id','organizations'],['tasks','assigned_user_id','users'],
    ['order_status_history','order_id','orders'],['order_status_history','actor_user_id','users'],
    ['audit_events','organization_id','organizations'],['audit_events','actor_user_id','users']
  ] loop
    execute format('alter table public.vision_%I add foreign key (tenant_id,%I) references public.vision_%I(tenant_id,id)',edge[1],edge[2],edge[3]);
  end loop;
end $$;
alter table public.vision_membership_roles add column tenant_id uuid;
update public.vision_membership_roles mr set tenant_id=m.tenant_id from public.vision_memberships m where m.id=mr.membership_id;
alter table public.vision_membership_roles alter column tenant_id set not null;
alter table public.vision_membership_roles add foreign key(tenant_id,membership_id) references public.vision_memberships(tenant_id,id);
alter table public.vision_membership_roles add foreign key(tenant_id,role_id) references public.vision_roles(tenant_id,id);

create table public.vision_guest_links(
 tenant_id uuid not null, user_id uuid not null, customer_id uuid not null,
 requester_organization_id uuid not null, active boolean not null default true,
 primary key(tenant_id,user_id,customer_id,requester_organization_id),
 foreign key(tenant_id,user_id) references public.vision_users(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.vision_customers(tenant_id,id),
 foreign key(tenant_id,requester_organization_id) references public.vision_organizations(tenant_id,id)
);

-- Claims are installed by a JWT-verifying gateway, never from a request body.
-- Invalid/missing identity deliberately becomes NULL (deny).
create function vision_private.actor() returns uuid language plpgsql stable set search_path='' as $$
begin
 return (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid;
exception when invalid_text_representation then return null;
end $$;

create function vision_private.active_actor(t uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vision_users where id=vision_private.actor() and tenant_id=t and status='ACTIVE');
$$;

create function vision_private.permitted(t uuid, org uuid, permission text, who uuid default vision_private.actor()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.vision_memberships m
 join public.vision_users u on (u.tenant_id,u.id)=(m.tenant_id,m.user_id)
 join public.vision_organizations o on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
 join public.vision_membership_roles mr on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
 join public.vision_role_permissions rp on rp.role_id=mr.role_id
 join public.vision_permissions p on p.id=rp.permission_id
 where m.tenant_id=t and m.organization_id=org and m.user_id=who
 and m.status='ACTIVE' and u.status='ACTIVE' and o.status='ACTIVE' and p.code=permission);
$$;

create function vision_private.guest_owns(t uuid,c uuid,org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select vision_private.active_actor(t) and exists(select 1 from public.vision_guest_links g
 join public.vision_organizations o on (o.tenant_id,o.id)=(g.tenant_id,g.requester_organization_id)
 where g.tenant_id=t and g.user_id=vision_private.actor() and g.customer_id=c
 and g.requester_organization_id=org and g.active and o.status='ACTIVE');
$$;

create function vision_private.read_order(oid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vision_orders o where o.id=oid and (
 vision_private.guest_owns(o.tenant_id,o.customer_id,o.requester_organization_id)
 or vision_private.permitted(o.tenant_id,o.requester_organization_id,'views.order.read')
 or vision_private.permitted(o.tenant_id,o.provider_organization_id,'cleaning.order.read')
 or vision_private.permitted(o.tenant_id,o.provider_organization_id,'cleaning.quality.review')
 or exists(select 1 from public.vision_tasks t where t.order_id=o.id and t.assigned_user_id=vision_private.actor()
   and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.task.read_assigned'))));
$$;

do $$
declare t record;
begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'vision\_%' escape '\' loop
   execute format('alter table public.%I enable row level security',t.tablename);
   execute format('revoke all on public.%I from public,anon,authenticated',t.tablename);
 end loop;
end $$;
grant usage on schema vision_private to authenticated;
revoke all on all functions in schema vision_private from public,anon,authenticated;
grant execute on function vision_private.actor(),vision_private.active_actor(uuid),vision_private.permitted(uuid,uuid,text,uuid),vision_private.guest_owns(uuid,uuid,uuid),vision_private.read_order(uuid) to authenticated;
grant select on public.vision_orders,public.vision_tasks,public.vision_order_status_history,public.vision_audit_events to authenticated;
create policy vision_order_read on public.vision_orders for select to authenticated using(vision_private.read_order(id));
create policy vision_task_read on public.vision_tasks for select to authenticated using(
 vision_private.permitted(tenant_id,organization_id,'cleaning.order.read')
 or vision_private.permitted(tenant_id,organization_id,'cleaning.quality.review')
 or (assigned_user_id=vision_private.actor() and vision_private.permitted(tenant_id,organization_id,'cleaning.task.read_assigned')));
create policy vision_history_read on public.vision_order_status_history for select to authenticated using(vision_private.read_order(order_id));
create policy vision_audit_read on public.vision_audit_events for select to authenticated using(vision_private.permitted(tenant_id,organization_id,'audit.read'));
-- All INSERT/UPDATE/DELETE remain denied. Identity/RBAC/outbox tables have no client policies.
commit;
