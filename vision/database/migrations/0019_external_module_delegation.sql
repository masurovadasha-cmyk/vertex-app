-- VERTEX VISION architecture 2.3: delegated external-module gateway scope.
-- Taxi remains a separate product/database; this adds only VISION authorization context.
begin;

create function public.vision_external_module_context_allowed(t uuid, org uuid, module_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.vision_memberships m
    join public.vision_users u on (u.tenant_id,u.id)=(m.tenant_id,m.user_id)
    join public.vision_organizations o on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
    where m.tenant_id=t
      and m.organization_id=org
      and m.user_id=vision_private.actor()
      and m.status='ACTIVE'
      and u.status='ACTIVE'
      and o.status='ACTIVE'
  )
  and exists(
    select 1 from public.vision_module_definitions d where d.id=module_id
  );
$$;

revoke all on function public.vision_external_module_context_allowed(uuid,uuid,text) from public,anon;
grant execute on function public.vision_external_module_context_allowed(uuid,uuid,text) to authenticated;

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $readiness_v23$
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
   and to_regclass('public.vision_escalations') is not null
   and to_regclass('public.vision_event_inbox') is not null;
 functions_ok:=
   to_regprocedure('public.vision_views_command(jsonb)') is not null
   and to_regprocedure('public.vision_session_context(uuid,uuid)') is not null
   and to_regprocedure('public.vision_session_scopes()') is not null
   and to_regprocedure('public.vision_work_feed(uuid,uuid,integer)') is not null
   and to_regprocedure('public.vision_work_command(jsonb)') is not null
   and to_regprocedure('public.vision_notification_feed(uuid,uuid,integer)') is not null
   and to_regprocedure('public.vision_notification_command(jsonb)') is not null
   and to_regprocedure('public.vision_notification_consume(uuid,uuid,text,text,uuid,uuid,text,jsonb)') is not null
   and to_regprocedure('public.vision_reconcile_escalations(uuid,uuid)') is not null
   and to_regprocedure('public.vision_outbox_fail(uuid,uuid)') is not null
   and to_regprocedure('public.vision_background_scopes(integer)') is not null
   and to_regprocedure('public.vision_external_module_context_allowed(uuid,uuid,text)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;
 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights',
    'vision_approval_requests','vision_notifications','vision_escalations','vision_event_inbox');
 select exists(select 1 from public.vision_module_definitions where id='views' and release_state='ACTIVE') into views_release_active;
 ready:=latest='0019_external_module_delegation.sql' and migration_count>=19 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,
   'tables_ok',tables_ok,'functions_ok',functions_ok,'rls_ok',rls_ok,
   'views_release_active',views_release_active,'architecture_version','2.3'
 );
end
$readiness_v23$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
