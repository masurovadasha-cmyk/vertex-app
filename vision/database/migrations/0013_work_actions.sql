-- VERTEX VISION Work Actions / SLA / Approval Decisions 0.1
-- Additive command layer for the existing task/order lifecycle plus approval decisions.
-- No production migration is performed by the build.
begin;

alter table public.vision_tasks
 add column accepted_at timestamptz,
 add column submitted_at timestamptz,
 add column completed_at timestamptz,
 add column waiting_reason text check(waiting_reason is null or length(waiting_reason) between 1 and 500);

alter table public.vision_approval_requests
 add column requested_by uuid,
 add column decided_by uuid,
 add column decided_at timestamptz,
 add column decision_reason text check(decision_reason is null or length(decision_reason) between 1 and 500),
 add column correlation_id uuid not null default gen_random_uuid(),
 add foreign key(tenant_id,requested_by) references public.vision_users(tenant_id,id),
 add foreign key(tenant_id,decided_by) references public.vision_users(tenant_id,id);

create index vision_task_due_idx
 on public.vision_tasks(tenant_id,organization_id,status,due_at,created_at desc);
create index vision_approval_due_idx
 on public.vision_approval_requests(tenant_id,organization_id,status,due_at,created_at desc);

create function public.vision_work_assignees(p_tenant uuid,p_organization uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $work_assignees$
declare
 actor uuid:=vision_private.actor();
 result jsonb:='[]'::jsonb;
begin
 if actor is null or p_tenant is null or p_organization is null
    or not vision_private.active_actor(p_tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if not vision_private.permitted(p_tenant,p_organization,'cleaning.order.assign') then
   return result;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'display_name',u.display_name) order by u.display_name,u.id),'[]'::jsonb)
 into result
 from public.vision_memberships m
 join public.vision_users u on (u.tenant_id,u.id)=(m.tenant_id,m.user_id)
 join public.vision_organizations o on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
 where m.tenant_id=p_tenant and m.organization_id=p_organization
   and m.status='ACTIVE' and u.status='ACTIVE' and o.status='ACTIVE'
   and vision_private.permitted(p_tenant,p_organization,'cleaning.task.read_assigned',u.id)
   and vision_private.permitted(p_tenant,p_organization,'cleaning.task.update_assigned',u.id);
 return result;
end
$work_assignees$;

revoke all on function public.vision_work_assignees(uuid,uuid) from public,anon;
grant execute on function public.vision_work_assignees(uuid,uuid) to authenticated;

create function public.vision_work_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $work_command$
declare
 actor uuid:=vision_private.actor(); tenant uuid; command_type text; idem text; reason text;
 task_id uuid; approval_id uuid; assignee uuid; expected bigint; expected_order bigint;
 t public.vision_tasks; o public.vision_orders; a public.vision_approval_requests;
 receipt public.vision_command_receipts;
 old_order_status text; old_task_status text; event_name text;
 event_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); correlation uuid;
 allowed boolean:=false; response jsonb; payload jsonb;
begin
 if jsonb_typeof(command) is distinct from 'object' or exists(
   select 1 from jsonb_object_keys(command) k where k not in
   ('type','tenant_id','idempotency_key','task_id','approval_id','expected_version',
    'expected_order_version','assignee_user_id','reason')
 ) then raise exception 'invalid_command' using errcode='22023'; end if;

 tenant:=(command->>'tenant_id')::uuid;
 command_type:=command->>'type';
 idem:=command->>'idempotency_key';
 reason:=nullif(btrim(command->>'reason'),'');
 if actor is null or tenant is null or not vision_private.active_actor(tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if idem is null or length(idem) not between 1 and 128 or command_type is null then
   raise exception 'invalid_command' using errcode='22023';
 end if;
 if reason is not null and length(reason)>500 then raise exception 'invalid_command' using errcode='22023'; end if;

 perform pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||idem,0));

 if command_type in ('task_assign','task_accept','task_wait','task_resume','task_submit','quality_pass','quality_reject') then
   task_id:=(command->>'task_id')::uuid;
   select * into t from public.vision_tasks where id=task_id and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   select * into o from public.vision_orders where id=t.order_id and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   allowed:=case command_type
     when 'task_assign' then vision_private.permitted(tenant,t.organization_id,'cleaning.order.assign')
     when 'task_accept' then t.assigned_user_id=actor and vision_private.permitted(tenant,t.organization_id,'cleaning.task.update_assigned')
     when 'task_wait' then t.assigned_user_id=actor and vision_private.permitted(tenant,t.organization_id,'cleaning.task.update_assigned')
     when 'task_resume' then t.assigned_user_id=actor and vision_private.permitted(tenant,t.organization_id,'cleaning.task.update_assigned')
     when 'task_submit' then t.assigned_user_id=actor and vision_private.permitted(tenant,t.organization_id,'cleaning.task.update_assigned')
     when 'quality_pass' then actor<>t.assigned_user_id and vision_private.permitted(tenant,t.organization_id,'cleaning.quality.review')
     when 'quality_reject' then actor<>t.assigned_user_id and vision_private.permitted(tenant,t.organization_id,'cleaning.quality.review')
     else false end;
 elsif command_type in ('approval_approve','approval_reject') then
   approval_id:=(command->>'approval_id')::uuid;
   select * into a from public.vision_approval_requests where id=approval_id and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   allowed:=vision_private.permitted(tenant,a.organization_id,'vision.approval.decide')
     and (a.assigned_user_id is null or a.assigned_user_id=actor)
     and (a.requested_by is null or a.requested_by<>actor);
 else
   raise exception 'invalid_command' using errcode='22023';
 end if;
 if allowed is distinct from true then raise exception 'forbidden' using errcode='42501'; end if;

 select * into receipt from public.vision_command_receipts r
 where r.tenant_id=tenant and r.actor_user_id=actor and r.idempotency_key=idem;
 if found then
   if receipt.command<>command then raise exception 'idempotency_conflict' using errcode='23505'; end if;
   return receipt.response;
 end if;

 expected:=(command->>'expected_version')::bigint;
 if command_type like 'task_%' or command_type like 'quality_%' then
   expected_order:=(command->>'expected_order_version')::bigint;
   if expected is distinct from t.version or expected_order is distinct from o.version then
     raise exception 'version_conflict' using errcode='40001';
   end if;
   old_order_status:=o.status; old_task_status:=t.status; correlation:=o.correlation_id;

   if command_type='task_assign' and t.status='NEW' and o.status='NEW' then
     assignee:=(command->>'assignee_user_id')::uuid;
     if assignee is null
       or not vision_private.permitted(tenant,t.organization_id,'cleaning.task.read_assigned',assignee)
       or not vision_private.permitted(tenant,t.organization_id,'cleaning.task.update_assigned',assignee) then
       raise exception 'invalid_assignee' using errcode='42501';
     end if;
     update public.vision_orders set status='ACCEPTED',version=version+1,updated_at=now() where id=o.id returning * into o;
     update public.vision_tasks set status='ASSIGNED',assigned_user_id=assignee,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='order.assigned';

   elsif command_type='task_accept' and t.status='ASSIGNED' and o.status='ACCEPTED' then
     update public.vision_orders set status='IN_PROGRESS',version=version+1,updated_at=now() where id=o.id returning * into o;
     update public.vision_tasks set status='IN_PROGRESS',accepted_at=coalesce(accepted_at,now()),waiting_reason=null,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='task.started';

   elsif command_type='task_wait' and t.status='IN_PROGRESS' and o.status='IN_PROGRESS' then
     if reason is null then raise exception 'reason_required' using errcode='22023'; end if;
     update public.vision_tasks set status='WAITING',waiting_reason=reason,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='task.waiting';

   elsif command_type='task_resume' and t.status='WAITING' and o.status='IN_PROGRESS' then
     update public.vision_tasks set status='IN_PROGRESS',waiting_reason=null,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='task.resumed';

   elsif command_type='task_submit' and t.status='IN_PROGRESS' and o.status='IN_PROGRESS' then
     update public.vision_orders set status='QUALITY',version=version+1,updated_at=now() where id=o.id returning * into o;
     update public.vision_tasks set status='QUALITY',submitted_at=now(),waiting_reason=null,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='task.completed';

   elsif command_type='quality_pass' and t.status='QUALITY' and o.status='QUALITY' then
     update public.vision_orders set status='COMPLETED',version=version+1,updated_at=now() where id=o.id returning * into o;
     update public.vision_tasks set status='COMPLETED',completed_at=now(),version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='quality.passed';

   elsif command_type='quality_reject' and t.status='QUALITY' and o.status='QUALITY' then
     if reason is null then raise exception 'reason_required' using errcode='22023'; end if;
     update public.vision_orders set status='IN_PROGRESS',version=version+1,updated_at=now() where id=o.id returning * into o;
     update public.vision_tasks set status='IN_PROGRESS',submitted_at=null,version=version+1,updated_at=now()
       where id=t.id returning * into t;
     event_name:='quality.rejected';
   else
     raise exception 'invalid_transition' using errcode='22023';
   end if;

   if old_order_status is distinct from o.status then
     insert into public.vision_order_status_history(tenant_id,order_id,from_status,to_status,actor_user_id,reason)
     values(tenant,o.id,old_order_status,o.status,actor,reason);
   end if;

   payload:=jsonb_build_object(
     'event_id',event_id,'tenant_id',tenant,'organization_id',t.organization_id,
     'order_id',o.id,'task_id',t.id,'assignee_user_id',t.assigned_user_id,
     'correlation_id',correlation,'occurred_at',now(),'status',t.status,
     'version',t.version,'order_status',o.status,'order_version',o.version,
     'from_task_status',old_task_status,'reason',reason
   );

   insert into public.vision_audit_events(tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload)
   values(tenant,t.organization_id,actor,event_name,'task',t.id,request_id,correlation,payload);
   insert into public.vision_outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
   values(event_id,tenant,event_name,'task',t.id,correlation,payload);

   response:=jsonb_build_object(
     'entity_type','task','task_id',t.id,'task_status',t.status,'task_version',t.version,
     'order_id',o.id,'order_status',o.status,'order_version',o.version,'correlation_id',correlation
   );

 else
   correlation:=a.correlation_id;
   if expected is distinct from a.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if a.status<>'PENDING' then raise exception 'invalid_transition' using errcode='22023'; end if;
   if command_type='approval_reject' and reason is null then raise exception 'reason_required' using errcode='22023'; end if;

   update public.vision_approval_requests set
     status=case when command_type='approval_approve' then 'APPROVED' else 'REJECTED' end,
     decided_by=actor,decided_at=now(),decision_reason=reason,version=version+1,updated_at=now()
   where id=a.id returning * into a;
   event_name:=case when command_type='approval_approve' then 'approval.approved' else 'approval.rejected' end;

   payload:=jsonb_build_object(
     'event_id',event_id,'tenant_id',tenant,'organization_id',a.organization_id,
     'approval_id',a.id,'correlation_id',correlation,'occurred_at',now(),
     'status',a.status,'version',a.version,'reason',reason
   );
   insert into public.vision_audit_events(tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload)
   values(tenant,a.organization_id,actor,event_name,'approval',a.id,request_id,correlation,payload);
   insert into public.vision_outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
   values(event_id,tenant,event_name,'approval',a.id,correlation,payload);

   response:=jsonb_build_object(
     'entity_type','approval','approval_id',a.id,'approval_status',a.status,
     'approval_version',a.version,'correlation_id',correlation
   );
 end if;

 insert into public.vision_command_receipts(tenant_id,actor_user_id,idempotency_key,command,response)
 values(tenant,actor,idem,command,response);
 return response;
end
$work_command$;

revoke all on function public.vision_work_command(jsonb) from public,anon;
grant execute on function public.vision_work_command(jsonb) to authenticated;

create or replace function public.vision_work_feed(
 p_tenant uuid,
 p_organization uuid,
 p_limit integer default 50
) returns jsonb
language plpgsql stable security invoker set search_path='' as $work_feed_v2$
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
       t.id,'task'::text as type,'core.task'::text as source,t.title,t.status,
       coalesce(o.priority,'NORMAL')::text as priority,t.due_at,(t.assigned_user_id=actor) as assigned_to_me,
       o.id as source_id,t.created_at,t.updated_at,t.version,o.version as order_version,t.assigned_user_id,
       case when t.due_at is null then 'NONE' when t.due_at<now() then 'BREACHED' else 'ACTIVE' end::text as sla_state,
       case
         when t.status='NEW' and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.order.assign')
           then jsonb_build_array('task_assign')
         when t.status='ASSIGNED' and t.assigned_user_id=actor and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.task.update_assigned')
           then jsonb_build_array('task_accept')
         when t.status='IN_PROGRESS' and t.assigned_user_id=actor and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.task.update_assigned')
           then jsonb_build_array('task_wait','task_submit')
         when t.status='WAITING' and t.assigned_user_id=actor and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.task.update_assigned')
           then jsonb_build_array('task_resume')
         when t.status='QUALITY' and actor<>t.assigned_user_id and vision_private.permitted(t.tenant_id,t.organization_id,'cleaning.quality.review')
           then jsonb_build_array('quality_pass','quality_reject')
         else '[]'::jsonb end as actions
     from public.vision_tasks t
     join public.vision_orders o on o.tenant_id=t.tenant_id and o.id=t.order_id
     where t.tenant_id=p_tenant and t.organization_id=p_organization
       and t.status not in ('COMPLETED','CANCELLED')

     union all

     select
       j.id,'task'::text,'views.cleaning'::text,
       ('Cleaning · '||coalesce(u.unit_number,'—'))::text,j.status,
       (case when j.status='INSPECTION' then 'HIGH' else 'NORMAL' end)::text,
       null::timestamptz,false,j.id,j.created_at,j.updated_at,j.version,null::bigint,null::uuid,
       'NONE'::text,'[]'::jsonb
     from public.vision_views_cleaning_jobs j
     left join public.vision_views_units u on u.tenant_id=j.tenant_id and u.id=j.unit_id
     where j.tenant_id=p_tenant and j.organization_id=p_organization and j.status<>'VERIFIED'
   ) raw_tasks
   order by due_at nulls last,created_at desc,id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.created_at desc,x.id),'[]'::jsonb)
 into approvals
 from (
   select
     a.id,'approval'::text as type,'vision.approval'::text as source,a.kind,a.title,a.status,a.priority,a.due_at,
     (a.assigned_user_id=actor) as assigned_to_me,a.entity_type,a.entity_id,a.created_at,a.updated_at,
     a.version,a.assigned_user_id,a.requested_by,
     case when a.due_at is null then 'NONE' when a.due_at<now() then 'BREACHED' else 'ACTIVE' end::text as sla_state,
     case when a.status='PENDING'
       and vision_private.permitted(a.tenant_id,a.organization_id,'vision.approval.decide')
       and (a.assigned_user_id is null or a.assigned_user_id=actor)
       and (a.requested_by is null or a.requested_by<>actor)
       then jsonb_build_array('approval_approve','approval_reject') else '[]'::jsonb end as actions
   from public.vision_approval_requests a
   where a.tenant_id=p_tenant and a.organization_id=p_organization and a.status='PENDING'
   order by a.due_at nulls last,a.created_at desc,a.id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb)
 into requests
 from (
   select o.id,'request'::text as type,'core.order'::text as source,('Order '||o.public_no)::text as title,
     o.status,o.priority,o.id as source_id,o.created_at,o.updated_at
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
     select t.id,'attention'::text as type,'core.task'::text as source,t.title,'OVERDUE_TASK'::text as reason,
       coalesce(o.priority,'NORMAL')::text as priority,
       case coalesce(o.priority,'NORMAL') when 'CRITICAL' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end as priority_rank,
       t.due_at,t.order_id as source_id,t.created_at
     from public.vision_tasks t left join public.vision_orders o on o.tenant_id=t.tenant_id and o.id=t.order_id
     where t.tenant_id=p_tenant and t.organization_id=p_organization
       and t.status not in ('COMPLETED','CANCELLED') and t.due_at is not null and t.due_at<now()

     union all

     select a.id,'attention'::text,'vision.approval'::text,a.title,'OVERDUE_APPROVAL'::text,a.priority,
       case a.priority when 'CRITICAL' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end,
       a.due_at,a.id,a.created_at
     from public.vision_approval_requests a
     where a.tenant_id=p_tenant and a.organization_id=p_organization
       and a.status='PENDING' and a.due_at is not null and a.due_at<now()

     union all

     select o.id,'attention'::text,'core.order'::text,('Order '||o.public_no)::text,'HIGH_PRIORITY_REQUEST'::text,
       o.priority,case o.priority when 'CRITICAL' then 4 else 3 end,null::timestamptz,o.id,o.created_at
     from public.vision_orders o
     where o.tenant_id=p_tenant
       and (o.requester_organization_id=p_organization or o.provider_organization_id=p_organization)
       and o.status not in ('COMPLETED','CANCELLED') and o.priority in ('HIGH','CRITICAL')

     union all

     select j.id,'attention'::text,'views.cleaning'::text,
       ('Cleaning inspection · '||coalesce(u.unit_number,'—'))::text,'CLEANING_INSPECTION'::text,
       'HIGH'::text,3,null::timestamptz,j.id,j.created_at
     from public.vision_views_cleaning_jobs j
     left join public.vision_views_units u on u.tenant_id=j.tenant_id and u.id=j.unit_id
     where j.tenant_id=p_tenant and j.organization_id=p_organization and j.status='INSPECTION'
   ) raw_attention
   order by priority_rank desc,due_at nulls last,created_at desc,id
   limit p_limit
 ) x;

 return jsonb_build_object(
   'generated_at',now(),'tasks',tasks,'approvals',approvals,'attention',attention,'requests',requests,
   'counts',jsonb_build_object(
     'tasks',jsonb_array_length(tasks),'approvals',jsonb_array_length(approvals),
     'attention',jsonb_array_length(attention),'requests',jsonb_array_length(requests)
   )
 );
end
$work_feed_v2$;

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $readiness_v18$
declare
 latest text; migration_count integer; tables_ok boolean; functions_ok boolean;
 rls_ok boolean; views_release_active boolean; ready boolean;
begin
 select max(name),count(*)::int into latest,migration_count from vision_private.schema_migrations;
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
   and to_regprocedure('public.vision_work_command(jsonb)') is not null
   and to_regprocedure('public.vision_work_assignees(uuid,uuid)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;
 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights','vision_approval_requests');
 select exists(select 1 from public.vision_module_definitions where id='views' and release_state='ACTIVE') into views_release_active;
 ready:=latest='0013_work_actions.sql' and migration_count>=13 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,'tables_ok',tables_ok,
   'functions_ok',functions_ok,'rls_ok',rls_ok,'views_release_active',views_release_active,'architecture_version','1.8'
 );
end
$readiness_v18$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
