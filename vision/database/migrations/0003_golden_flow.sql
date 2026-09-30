begin;
alter table public.vision_orders add column correlation_id uuid not null default gen_random_uuid();
create unique index vision_one_cleaning_task on public.vision_tasks(order_id);
create table public.vision_command_receipts(
 tenant_id uuid not null, actor_user_id uuid not null, idempotency_key text not null,
 command jsonb not null, response jsonb not null, created_at timestamptz not null default now(),
 primary key(tenant_id,actor_user_id,idempotency_key),
 foreign key(tenant_id,actor_user_id) references public.vision_users(tenant_id,id)
);
alter table public.vision_command_receipts enable row level security;
revoke all on public.vision_command_receipts from public,anon,authenticated;

create function vision_private.immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_record' using errcode='42501'; end $$;
revoke all on function vision_private.immutable_record() from public;
create trigger vision_audit_immutable before update or delete on public.vision_audit_events for each row execute function vision_private.immutable_record();
create trigger vision_history_immutable before update or delete on public.vision_order_status_history for each row execute function vision_private.immutable_record();
create trigger vision_receipt_immutable before update or delete on public.vision_command_receipts for each row execute function vision_private.immutable_record();

create function public.vision_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=vision_private.actor(); tenant uuid; kind text; idem text;
 o public.vision_orders; task public.vision_tasks; service public.vision_services;
 receipt public.vision_command_receipts; customer uuid; requester uuid; assignee uuid;
 old_status text; event_name text; event_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid();
 response jsonb; payload jsonb; allowed boolean:=false;
begin
 if jsonb_typeof(command) is distinct from 'object' or exists(select 1 from jsonb_object_keys(command) k where k not in
 ('type','tenant_id','idempotency_key','order_id','expected_version','customer_id','requester_organization_id','service_id','assignee_user_id')) then
   raise exception 'invalid_command' using errcode='22023';
 end if;
 tenant:=(command->>'tenant_id')::uuid; kind:=command->>'type'; idem:=command->>'idempotency_key';
 if actor is null or tenant is null or not vision_private.active_actor(tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if idem is null or length(idem) not between 1 and 128 or kind is null then
   raise exception 'invalid_command' using errcode='22023';
 end if;
 -- Serialize retries across connections. Hash collisions only reduce concurrency.
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||idem,0));
 if kind='create' then
   customer:=(command->>'customer_id')::uuid; requester:=(command->>'requester_organization_id')::uuid;
   allowed:=vision_private.guest_owns(tenant,customer,requester)
     or vision_private.permitted(tenant,requester,'views.order.create');
 else
   select * into o from public.vision_orders where id=(command->>'order_id')::uuid and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   select * into task from public.vision_tasks where order_id=o.id;
   allowed:=case kind
     when 'assign' then vision_private.permitted(tenant,o.provider_organization_id,'cleaning.order.assign')
     when 'start' then task.assigned_user_id=actor and vision_private.permitted(tenant,task.organization_id,'cleaning.task.update_assigned')
     when 'submit' then task.assigned_user_id=actor and vision_private.permitted(tenant,task.organization_id,'cleaning.task.update_assigned')
     when 'pass' then actor<>task.assigned_user_id and vision_private.permitted(tenant,o.provider_organization_id,'cleaning.quality.review')
     when 'reject' then actor<>task.assigned_user_id and vision_private.permitted(tenant,o.provider_organization_id,'cleaning.quality.review')
     else false end;
 end if;
 if allowed is distinct from true then raise exception 'forbidden' using errcode='42501'; end if;
 -- Re-authorize before replay; suspended users never get an old response.
 select * into receipt from public.vision_command_receipts r where r.tenant_id=tenant and r.actor_user_id=actor and r.idempotency_key=idem;
 if found then
   if receipt.command<>command then raise exception 'idempotency_conflict' using errcode='23505'; end if;
   return receipt.response;
 end if;
 if kind='create' then
   select * into service from public.vision_services s where s.id=(command->>'service_id')::uuid and s.tenant_id=tenant
     and s.code in ('cleaning.guest','cleaning.checkout') and s.status='ACTIVE'
     and exists(select 1 from public.vision_organizations org where org.id=s.provider_organization_id and org.status='ACTIVE');
   if not found or not exists(select 1 from public.vision_customers where id=customer and tenant_id=tenant and status='ACTIVE') then
     raise exception 'invalid_service_or_customer' using errcode='22023';
   end if;
   insert into public.vision_orders(tenant_id,public_no,customer_id,requester_organization_id,provider_organization_id,service_id,status,idempotency_key,created_by)
   values(tenant,'V-'||gen_random_uuid()::text,customer,requester,service.provider_organization_id,service.id,'NEW',actor::text||':'||idem,actor) returning * into o;
   insert into public.vision_tasks(tenant_id,order_id,organization_id,title,status)
   values(tenant,o.id,o.provider_organization_id,'Cleaning service','NEW') returning * into task;
   event_name:='order.created';
 else
   if (command->>'expected_version')::bigint is distinct from o.version then raise exception 'version_conflict' using errcode='40001'; end if;
   old_status:=o.status;
   if kind='assign' and o.status='NEW' then
     assignee:=(command->>'assignee_user_id')::uuid;
     if not vision_private.permitted(tenant,o.provider_organization_id,'cleaning.task.update_assigned',assignee)
       or not vision_private.permitted(tenant,o.provider_organization_id,'cleaning.task.read_assigned',assignee) then
       raise exception 'invalid_assignee' using errcode='42501';
     end if;
     o.status:='ACCEPTED'; task.status:='ASSIGNED'; task.assigned_user_id:=assignee; event_name:='order.assigned';
   elsif kind='start' and o.status='ACCEPTED' then
     o.status:='IN_PROGRESS'; task.status:='IN_PROGRESS'; event_name:='task.started';
   elsif kind='submit' and o.status='IN_PROGRESS' then
     o.status:='QUALITY'; task.status:='QUALITY'; event_name:='task.completed';
   elsif kind='pass' and o.status='QUALITY' then
     o.status:='COMPLETED'; task.status:='COMPLETED'; event_name:='quality.passed';
   elsif kind='reject' and o.status='QUALITY' then
     o.status:='IN_PROGRESS'; task.status:='IN_PROGRESS'; event_name:='quality.rejected';
   else raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_orders set status=o.status,version=version+1,updated_at=now() where id=o.id returning * into o;
   update public.vision_tasks set status=task.status,assigned_user_id=task.assigned_user_id,version=version+1,updated_at=now() where id=task.id returning * into task;
 end if;
 insert into public.vision_order_status_history(tenant_id,order_id,from_status,to_status,actor_user_id)
 values(tenant,o.id,old_status,o.status,actor);
 payload:=jsonb_build_object('event_id',event_id,'tenant_id',tenant,'organization_id',o.provider_organization_id,
 'order_id',o.id,'task_id',task.id,'assignee_user_id',task.assigned_user_id,'correlation_id',o.correlation_id,
 'occurred_at',now(),'status',o.status,'version',o.version);
 insert into public.vision_audit_events(tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload)
 values(tenant,o.provider_organization_id,actor,event_name,'order',o.id,request_id,o.correlation_id,payload);
 insert into public.vision_outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
 values(event_id,tenant,event_name,'order',o.id,o.correlation_id,payload);
 response:=jsonb_build_object('order_id',o.id,'task_id',task.id,'status',o.status,'version',o.version,'correlation_id',o.correlation_id);
 insert into public.vision_command_receipts(tenant_id,actor_user_id,idempotency_key,command,response) values(tenant,actor,idem,command,response);
 return response;
end $$;
revoke all on function public.vision_command(jsonb) from public,anon;
grant execute on function public.vision_command(jsonb) to authenticated;

-- Dispatcher is a separate server principal. Authenticated users cannot claim/ack.
alter table public.vision_outbox_events add column lease_token uuid;
alter table public.vision_outbox_events add column lease_until timestamptz;
create function public.vision_outbox_claim(batch_size integer default 25) returns setof public.vision_outbox_events
language sql security definer set search_path='' as $$
 with pending as (
 select id from public.vision_outbox_events where published_at is null and (lease_until is null or lease_until<now())
 order by created_at,id for update skip locked limit greatest(1,least(batch_size,100))
 ) update public.vision_outbox_events e set lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1
 from pending where e.id=pending.id returning e.*;
$$;
create function public.vision_outbox_ack(event uuid, token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.vision_outbox_events set published_at=now(),lease_until=null,lease_token=null
 where id=event and lease_token=token and lease_until>now() and published_at is null;
 return found;
end $$;
revoke all on function public.vision_outbox_claim(integer),public.vision_outbox_ack(uuid,uuid) from public,anon,authenticated;
-- Operator grants these two functions to a dedicated NOINHERIT dispatcher login.
commit;
