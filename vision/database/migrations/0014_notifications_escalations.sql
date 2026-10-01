-- VERTEX VISION Notifications / Escalations 0.1
-- Additive foundation for user inbox, event-driven notification projection and SLA escalation records.
-- Dedicated consumers/schedulers remain external; public Preview does not fabricate connected delivery.
begin;

insert into public.vision_permissions(code,description) values
 ('vision.notification.read','Read own VISION notifications'),
 ('vision.escalation.read','Read organization escalations'),
 ('vision.escalation.ack','Acknowledge visible organization escalations')
on conflict(code) do nothing;

create table public.vision_notifications(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 user_id uuid not null,
 source_event_id uuid not null,
 event_type text not null check(event_type ~ '^[a-z][a-z0-9._-]{1,127}$'),
 kind text not null check(kind ~ '^[a-z][a-z0-9._-]{1,63}$'),
 title text not null check(length(title) between 1 and 240),
 body text check(body is null or length(body) between 1 and 1000),
 severity text not null default 'INFO' check(severity in ('INFO','SUCCESS','WARNING','CRITICAL')),
 status text not null default 'UNREAD' check(status in ('UNREAD','READ','DISMISSED')),
 entity_type text check(entity_type is null or entity_type ~ '^[a-z][a-z0-9._-]{1,63}$'),
 entity_id uuid,
 correlation_id uuid not null,
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 dismissed_at timestamptz,
 unique(tenant_id,user_id,source_event_id,kind),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,user_id) references public.vision_users(tenant_id,id)
);

create index vision_notifications_inbox_idx
 on public.vision_notifications(tenant_id,user_id,status,created_at desc);
create index vision_notifications_org_idx
 on public.vision_notifications(tenant_id,organization_id,created_at desc);

alter table public.vision_notifications enable row level security;
revoke all on public.vision_notifications from public,anon,authenticated;
grant select on public.vision_notifications to authenticated;

create policy vision_notifications_read_own on public.vision_notifications
 for select to authenticated using(
   user_id=vision_private.actor()
   and vision_private.active_member(tenant_id,organization_id)
 );

create table public.vision_escalations(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 source_type text not null check(source_type in ('TASK','APPROVAL','ORDER','CLEANING')),
 source_id uuid not null,
 rule_code text not null check(rule_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
 title text not null check(length(title) between 1 and 240),
 severity text not null check(severity in ('WARNING','CRITICAL')),
 status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
 assigned_user_id uuid,
 correlation_id uuid not null default gen_random_uuid(),
 version bigint not null default 1 check(version>0),
 opened_at timestamptz not null default now(),
 acknowledged_by uuid,
 acknowledged_at timestamptz,
 resolved_by uuid,
 resolved_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(tenant_id,organization_id,source_type,source_id,rule_code),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,assigned_user_id) references public.vision_users(tenant_id,id),
 foreign key(tenant_id,acknowledged_by) references public.vision_users(tenant_id,id),
 foreign key(tenant_id,resolved_by) references public.vision_users(tenant_id,id)
);

create index vision_escalations_queue_idx
 on public.vision_escalations(tenant_id,organization_id,status,severity,opened_at desc);
create index vision_escalations_assignee_idx
 on public.vision_escalations(tenant_id,assigned_user_id,status,opened_at desc);

alter table public.vision_escalations enable row level security;
revoke all on public.vision_escalations from public,anon,authenticated;
grant select on public.vision_escalations to authenticated;

create policy vision_escalations_read on public.vision_escalations
 for select to authenticated using(
   vision_private.active_member(tenant_id,organization_id)
   and (
     assigned_user_id=vision_private.actor()
     or vision_private.permitted(tenant_id,organization_id,'vision.escalation.read')
     or vision_private.permitted(tenant_id,organization_id,'vision.escalation.ack')
   )
 );

create function vision_private.notification_title(p_event_type text) returns text
language sql immutable set search_path='' as $notification_title$
 select case p_event_type
   when 'order.assigned' then 'Task assigned'
   when 'task.started' then 'Task started'
   when 'task.waiting' then 'Task waiting'
   when 'task.resumed' then 'Task resumed'
   when 'task.completed' then 'Task submitted'
   when 'quality.rejected' then 'Quality review returned work'
   when 'quality.passed' then 'Quality review passed'
   when 'approval.requested' then 'Approval requested'
   when 'approval.approved' then 'Approval approved'
   when 'approval.rejected' then 'Approval rejected'
   else 'VERTEX VISION update'
 end;
$notification_title$;
revoke all on function vision_private.notification_title(text) from public;

create function vision_private.notification_kind(p_event_type text) returns text
language sql immutable set search_path='' as $notification_kind$
 select case
   when p_event_type like 'approval.%' then 'approval'
   when p_event_type like 'quality.%' then 'quality'
   when p_event_type like 'task.%' or p_event_type='order.assigned' then 'task'
   else 'system'
 end;
$notification_kind$;
revoke all on function vision_private.notification_kind(text) from public;

create function vision_private.notification_severity(p_event_type text) returns text
language sql immutable set search_path='' as $notification_severity$
 select case
   when p_event_type in ('quality.rejected','approval.rejected') then 'WARNING'
   when p_event_type in ('quality.passed','approval.approved') then 'SUCCESS'
   else 'INFO'
 end;
$notification_severity$;
revoke all on function vision_private.notification_severity(text) from public;

create function public.vision_notification_consume(
 p_tenant uuid,
 p_event_id uuid,
 p_event_type text,
 p_aggregate_type text,
 p_aggregate_id uuid,
 p_correlation_id uuid,
 p_payload_sha256 text,
 p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $notification_consume$
declare
 claim jsonb;
 lease uuid;
 org uuid;
 recipient uuid;
 inserted_count integer:=0;
 approval_id uuid;
begin
 if jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'tenant_id' is distinct from p_tenant::text
    or p_payload->>'event_id' is distinct from p_event_id::text
    or p_payload->>'correlation_id' is distinct from p_correlation_id::text then
   raise exception 'invalid_event_envelope' using errcode='22023';
 end if;

 claim:=public.vision_inbox_begin(
   p_tenant,'vision.notifications',p_event_id,p_event_type,p_aggregate_type,
   p_aggregate_id,p_correlation_id,p_payload_sha256
 );
 if coalesce((claim->>'claimed')::boolean,false) is not true then
   return jsonb_build_object('processed',false,'duplicate',true,'status',claim->>'status');
 end if;
 lease:=(claim->>'lease_token')::uuid;
 org:=nullif(p_payload->>'organization_id','')::uuid;

 if org is null then
   perform public.vision_inbox_fail(p_tenant,'vision.notifications',p_event_id,lease,'MISSING_ORGANIZATION');
   raise exception 'invalid_event_envelope' using errcode='22023';
 end if;

 create temporary table if not exists pg_temp.vision_notification_targets(
   user_id uuid primary key
 ) on commit drop;
 truncate table pg_temp.vision_notification_targets;

 if nullif(p_payload->>'assignee_user_id','') is not null then
   recipient:=(p_payload->>'assignee_user_id')::uuid;
   if vision_private.active_member(p_tenant,org,recipient) then
     insert into pg_temp.vision_notification_targets(user_id) values(recipient) on conflict do nothing;
   end if;
 end if;

 if p_event_type='approval.requested' then
   approval_id:=coalesce(nullif(p_payload->>'approval_id','')::uuid,p_aggregate_id);
   insert into pg_temp.vision_notification_targets(user_id)
   select a.assigned_user_id from public.vision_approval_requests a
   where a.tenant_id=p_tenant and a.id=approval_id and a.assigned_user_id is not null
     and vision_private.active_member(p_tenant,a.organization_id,a.assigned_user_id)
   on conflict do nothing;

   insert into pg_temp.vision_notification_targets(user_id)
   select m.user_id
   from public.vision_memberships m
   where m.tenant_id=p_tenant and m.organization_id=org and m.status='ACTIVE'
     and vision_private.permitted(p_tenant,org,'vision.approval.decide',m.user_id)
   on conflict do nothing;
 elsif p_event_type in ('approval.approved','approval.rejected') then
   approval_id:=coalesce(nullif(p_payload->>'approval_id','')::uuid,p_aggregate_id);
   insert into pg_temp.vision_notification_targets(user_id)
   select a.requested_by from public.vision_approval_requests a
   where a.tenant_id=p_tenant and a.id=approval_id and a.requested_by is not null
     and vision_private.active_member(p_tenant,a.organization_id,a.requested_by)
   on conflict do nothing;
 elsif p_event_type='task.waiting' then
   insert into pg_temp.vision_notification_targets(user_id)
   select m.user_id from public.vision_memberships m
   where m.tenant_id=p_tenant and m.organization_id=org and m.status='ACTIVE'
     and vision_private.permitted(p_tenant,org,'cleaning.order.assign',m.user_id)
   on conflict do nothing;
 elsif p_event_type='task.completed' then
   insert into pg_temp.vision_notification_targets(user_id)
   select m.user_id from public.vision_memberships m
   where m.tenant_id=p_tenant and m.organization_id=org and m.status='ACTIVE'
     and vision_private.permitted(p_tenant,org,'cleaning.quality.review',m.user_id)
   on conflict do nothing;
 end if;

 insert into public.vision_notifications(
   tenant_id,organization_id,user_id,source_event_id,event_type,kind,title,body,severity,
   entity_type,entity_id,correlation_id
 )
 select
   p_tenant,org,t.user_id,p_event_id,p_event_type,
   vision_private.notification_kind(p_event_type),
   vision_private.notification_title(p_event_type),
   null,
   vision_private.notification_severity(p_event_type),
   p_aggregate_type,p_aggregate_id,p_correlation_id
 from pg_temp.vision_notification_targets t
 on conflict(tenant_id,user_id,source_event_id,kind) do nothing;
 get diagnostics inserted_count=row_count;

 if not public.vision_inbox_complete(p_tenant,'vision.notifications',p_event_id,lease) then
   raise exception 'notification_inbox_lease_lost' using errcode='40001';
 end if;

 return jsonb_build_object('processed',true,'duplicate',false,'notifications_created',inserted_count);
exception
 when others then
   if lease is not null then
     perform public.vision_inbox_fail(p_tenant,'vision.notifications',p_event_id,lease,'CONSUMER_FAILED');
   end if;
   raise;
end
$notification_consume$;

revoke all on function public.vision_notification_consume(uuid,uuid,text,text,uuid,uuid,text,jsonb)
 from public,anon,authenticated;
-- Operator grants this only to a dedicated NOINHERIT event-consumer principal.

create function vision_private.approval_requested_outbox() returns trigger
language plpgsql security definer set search_path='' as $approval_requested_outbox$
declare event_id uuid:=gen_random_uuid();
begin
 insert into public.vision_outbox_events(
   id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
 ) values(
   event_id,new.tenant_id,'approval.requested','approval',new.id,new.correlation_id,
   jsonb_build_object(
     'event_id',event_id,'tenant_id',new.tenant_id,'organization_id',new.organization_id,
     'approval_id',new.id,'assignee_user_id',new.assigned_user_id,'requested_by',new.requested_by,
     'correlation_id',new.correlation_id,'occurred_at',now(),'status',new.status,'version',new.version
   )
 );
 return new;
end
$approval_requested_outbox$;
revoke all on function vision_private.approval_requested_outbox() from public;

create trigger vision_approval_requested_outbox
 after insert on public.vision_approval_requests
 for each row execute function vision_private.approval_requested_outbox();

create function public.vision_reconcile_escalations(p_tenant uuid,p_organization uuid) returns jsonb
language plpgsql security definer set search_path='' as $reconcile_escalations$
declare opened integer:=0; resolved integer:=0;
begin
 if p_tenant is null or p_organization is null
    or not exists(
      select 1 from public.vision_organizations
      where tenant_id=p_tenant and id=p_organization and status='ACTIVE'
    ) then raise exception 'invalid_scope' using errcode='22023'; end if;

 insert into public.vision_escalations(
   tenant_id,organization_id,source_type,source_id,rule_code,title,severity,assigned_user_id
 )
 select t.tenant_id,t.organization_id,'TASK',t.id,'TASK_SLA_BREACH',t.title,
   case coalesce(o.priority,'NORMAL') when 'CRITICAL' then 'CRITICAL' else 'WARNING' end,
   t.assigned_user_id
 from public.vision_tasks t
 left join public.vision_orders o on o.tenant_id=t.tenant_id and o.id=t.order_id
 where t.tenant_id=p_tenant and t.organization_id=p_organization
   and t.status not in ('COMPLETED','CANCELLED') and t.due_at is not null and t.due_at<now()
 on conflict(tenant_id,organization_id,source_type,source_id,rule_code)
 do update set
   title=excluded.title,severity=excluded.severity,assigned_user_id=excluded.assigned_user_id,
   status=case when public.vision_escalations.status='RESOLVED' then 'OPEN' else public.vision_escalations.status end,
   resolved_by=null,resolved_at=null,updated_at=now(),version=public.vision_escalations.version+1;
 get diagnostics opened=row_count;

 insert into public.vision_escalations(
   tenant_id,organization_id,source_type,source_id,rule_code,title,severity,assigned_user_id
 )
 select a.tenant_id,a.organization_id,'APPROVAL',a.id,'APPROVAL_SLA_BREACH',a.title,
   case a.priority when 'CRITICAL' then 'CRITICAL' else 'WARNING' end,a.assigned_user_id
 from public.vision_approval_requests a
 where a.tenant_id=p_tenant and a.organization_id=p_organization
   and a.status='PENDING' and a.due_at is not null and a.due_at<now()
 on conflict(tenant_id,organization_id,source_type,source_id,rule_code)
 do update set
   title=excluded.title,severity=excluded.severity,assigned_user_id=excluded.assigned_user_id,
   status=case when public.vision_escalations.status='RESOLVED' then 'OPEN' else public.vision_escalations.status end,
   resolved_by=null,resolved_at=null,updated_at=now(),version=public.vision_escalations.version+1;
 get diagnostics resolved=row_count;
 opened:=opened+resolved;

 update public.vision_escalations e set
   status='RESOLVED',resolved_at=now(),resolved_by=null,updated_at=now(),version=version+1
 where e.tenant_id=p_tenant and e.organization_id=p_organization and e.status<>'RESOLVED'
   and (
     (e.rule_code='TASK_SLA_BREACH' and not exists(
       select 1 from public.vision_tasks t
       where t.tenant_id=e.tenant_id and t.organization_id=e.organization_id and t.id=e.source_id
         and t.status not in ('COMPLETED','CANCELLED') and t.due_at is not null and t.due_at<now()
     ))
     or
     (e.rule_code='APPROVAL_SLA_BREACH' and not exists(
       select 1 from public.vision_approval_requests a
       where a.tenant_id=e.tenant_id and a.organization_id=e.organization_id and a.id=e.source_id
         and a.status='PENDING' and a.due_at is not null and a.due_at<now()
     ))
   );
 get diagnostics resolved=row_count;

 return jsonb_build_object('upserted',opened,'resolved',resolved);
end
$reconcile_escalations$;

revoke all on function public.vision_reconcile_escalations(uuid,uuid) from public,anon,authenticated;
-- Operator grants this only to a dedicated scheduler/worker principal.

create function public.vision_notification_feed(
 p_tenant uuid,
 p_organization uuid,
 p_limit integer default 50
) returns jsonb
language plpgsql stable security invoker set search_path='' as $notification_feed$
declare notifications jsonb:='[]'::jsonb; escalations jsonb:='[]'::jsonb;
begin
 if vision_private.actor() is null or p_tenant is null or p_organization is null
    or p_limit is null or p_limit not between 1 and 100
    or not vision_private.active_member(p_tenant,p_organization) then
   raise exception 'forbidden' using errcode='42501';
 end if;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb)
 into notifications
 from (
   select id,'notification'::text as type,kind,title,body,severity,status,event_type,
     entity_type,entity_id,correlation_id,version,created_at,read_at,dismissed_at
   from public.vision_notifications
   where tenant_id=p_tenant and organization_id=p_organization
     and user_id=vision_private.actor() and status<>'DISMISSED'
   order by created_at desc,id
   limit p_limit
 ) x;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.severity_rank desc,x.opened_at desc,x.id),'[]'::jsonb)
 into escalations
 from (
   select id,'escalation'::text as type,source_type,source_id,rule_code,title,severity,status,
     assigned_user_id,correlation_id,version,opened_at,acknowledged_at,resolved_at,
     case severity when 'CRITICAL' then 2 else 1 end as severity_rank,
     (status='OPEN' and (
       assigned_user_id=vision_private.actor()
       or vision_private.permitted(tenant_id,organization_id,'vision.escalation.ack')
     )) as can_ack
   from public.vision_escalations
   where tenant_id=p_tenant and organization_id=p_organization and status<>'RESOLVED'
   order by severity_rank desc,opened_at desc,id
   limit p_limit
 ) x;

 return jsonb_build_object(
   'generated_at',now(),
   'notifications',notifications,
   'escalations',escalations,
   'counts',jsonb_build_object(
     'unread',(select count(*)::int from public.vision_notifications where tenant_id=p_tenant and organization_id=p_organization and user_id=vision_private.actor() and status='UNREAD'),
     'escalations',jsonb_array_length(escalations)
   )
 );
end
$notification_feed$;

revoke all on function public.vision_notification_feed(uuid,uuid,integer) from public,anon;
grant execute on function public.vision_notification_feed(uuid,uuid,integer) to authenticated;

create function public.vision_notification_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $notification_command$
declare
 actor uuid:=vision_private.actor(); tenant uuid; command_type text; idem text;
 notification_id uuid; escalation_id uuid; expected bigint;
 n public.vision_notifications; e public.vision_escalations;
 receipt public.vision_command_receipts; response jsonb; correlation uuid;
 event_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); payload jsonb;
begin
 if jsonb_typeof(command) is distinct from 'object' or exists(
   select 1 from jsonb_object_keys(command) key_name where key_name not in
   ('type','tenant_id','idempotency_key','notification_id','escalation_id','expected_version')
 ) then raise exception 'invalid_command' using errcode='22023'; end if;

 tenant:=(command->>'tenant_id')::uuid;
 command_type:=command->>'type';
 idem:=command->>'idempotency_key';
 expected:=(command->>'expected_version')::bigint;

 if actor is null or tenant is null or not vision_private.active_actor(tenant)
    or idem is null or length(idem) not between 1 and 128
    or command_type is null or expected is null or expected<1 then
   raise exception 'invalid_command' using errcode='22023';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||idem,0));

 if command_type in ('notification_read','notification_unread','notification_dismiss') then
   notification_id:=(command->>'notification_id')::uuid;
   select * into n from public.vision_notifications
   where tenant_id=tenant and id=notification_id and user_id=actor for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;

   select * into receipt from public.vision_command_receipts r
   where r.tenant_id=tenant and r.actor_user_id=actor and r.idempotency_key=idem;
   if found then
     if receipt.command<>command then raise exception 'idempotency_conflict' using errcode='23505'; end if;
     return receipt.response;
   end if;

   if expected is distinct from n.version then raise exception 'version_conflict' using errcode='40001'; end if;

   if command_type='notification_read' then
     update public.vision_notifications set status='READ',read_at=coalesce(read_at,now()),dismissed_at=null,version=version+1
     where id=n.id returning * into n;
   elsif command_type='notification_unread' then
     update public.vision_notifications set status='UNREAD',read_at=null,dismissed_at=null,version=version+1
     where id=n.id returning * into n;
   else
     update public.vision_notifications set status='DISMISSED',dismissed_at=now(),version=version+1
     where id=n.id returning * into n;
   end if;
   correlation:=n.correlation_id;
   response:=jsonb_build_object('entity_type','notification','notification_id',n.id,'status',n.status,'version',n.version,'correlation_id',correlation);

 elsif command_type='escalation_ack' then
   escalation_id:=(command->>'escalation_id')::uuid;
   select * into e from public.vision_escalations where tenant_id=tenant and id=escalation_id for update;
   if not found or not vision_private.active_member(tenant,e.organization_id)
      or not (e.assigned_user_id=actor or vision_private.permitted(tenant,e.organization_id,'vision.escalation.ack')) then
     raise exception 'forbidden' using errcode='42501';
   end if;

   select * into receipt from public.vision_command_receipts r
   where r.tenant_id=tenant and r.actor_user_id=actor and r.idempotency_key=idem;
   if found then
     if receipt.command<>command then raise exception 'idempotency_conflict' using errcode='23505'; end if;
     return receipt.response;
   end if;

   if expected is distinct from e.version then raise exception 'version_conflict' using errcode='40001'; end if;

   if e.status<>'OPEN' then raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_escalations set
     status='ACKNOWLEDGED',acknowledged_by=actor,acknowledged_at=now(),version=version+1,updated_at=now()
   where id=e.id returning * into e;
   correlation:=e.correlation_id;
   response:=jsonb_build_object('entity_type','escalation','escalation_id',e.id,'status',e.status,'version',e.version,'correlation_id',correlation);
 else
   raise exception 'invalid_command' using errcode='22023';
 end if;

 payload:=response||jsonb_build_object('event_id',event_id,'tenant_id',tenant,'actor_user_id',actor,'occurred_at',now());
 insert into public.vision_audit_events(
   tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload
 ) values(
   tenant,coalesce(n.organization_id,e.organization_id),actor,command_type,
   response->>'entity_type',coalesce(notification_id,escalation_id),request_id,correlation,payload
 );
 insert into public.vision_command_receipts(tenant_id,actor_user_id,idempotency_key,command,response)
 values(tenant,actor,idem,command,response);
 return response;
end
$notification_command$;

revoke all on function public.vision_notification_command(jsonb) from public,anon;
grant execute on function public.vision_notification_command(jsonb) to authenticated;

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $readiness_v19$
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
   and to_regclass('public.vision_approval_requests') is not null
   and to_regclass('public.vision_notifications') is not null
   and to_regclass('public.vision_escalations') is not null;
 functions_ok:=
   to_regprocedure('public.vision_views_command(jsonb)') is not null
   and to_regprocedure('public.vision_session_context(uuid,uuid)') is not null
   and to_regprocedure('public.vision_work_feed(uuid,uuid,integer)') is not null
   and to_regprocedure('public.vision_work_command(jsonb)') is not null
   and to_regprocedure('public.vision_notification_feed(uuid,uuid,integer)') is not null
   and to_regprocedure('public.vision_notification_command(jsonb)') is not null
   and to_regprocedure('public.vision_notification_consume(uuid,uuid,text,text,uuid,uuid,text,jsonb)') is not null
   and to_regprocedure('public.vision_reconcile_escalations(uuid,uuid)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;
 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights',
    'vision_approval_requests','vision_notifications','vision_escalations');
 select exists(select 1 from public.vision_module_definitions where id='views' and release_state='ACTIVE') into views_release_active;
 ready:=latest='0014_notifications_escalations.sql' and migration_count>=14 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,
   'tables_ok',tables_ok,'functions_ok',functions_ok,'rls_ok',rls_ok,
   'views_release_active',views_release_active,'architecture_version','1.9'
 );
end
$readiness_v19$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
