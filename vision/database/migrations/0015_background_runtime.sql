-- VERTEX VISION Background Operations Runtime 0.1
-- Additive staging foundation for a dedicated background principal.
begin;

create function public.vision_outbox_fail(event uuid, token uuid) returns boolean
language plpgsql security definer set search_path='' as $vision_outbox_fail$
begin
 update public.vision_outbox_events
 set lease_until=null,lease_token=null
 where id=event
   and lease_token=token
   and published_at is null;
 return found;
end
$vision_outbox_fail$;

revoke all on function public.vision_outbox_fail(uuid,uuid) from public,anon,authenticated;
-- Operator may grant EXECUTE only to the dedicated background dispatcher principal.

create function public.vision_background_scopes(p_limit integer default 100)
returns table(tenant_id uuid,organization_id uuid)
language sql stable security definer set search_path='' as $vision_background_scopes$
 select o.tenant_id,o.id
 from public.vision_organizations o
 where o.status='ACTIVE'
   and exists(
     select 1
     from public.vision_module_installations mi
     join public.vision_module_definitions md on md.id=mi.module_id
     where mi.tenant_id=o.tenant_id
       and mi.organization_id=o.id
       and md.id='views'
       and mi.state='ENABLED'
   )
 order by o.tenant_id,o.id
 limit greatest(1,least(coalesce(p_limit,100),500));
$vision_background_scopes$;

revoke all on function public.vision_background_scopes(integer) from public,anon,authenticated;
-- Operator may grant EXECUTE only to the dedicated background scheduler principal.

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $readiness_v20$
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
   and to_regprocedure('public.vision_outbox_fail(uuid,uuid)') is not null
   and to_regprocedure('public.vision_background_scopes(integer)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;
 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights',
    'vision_approval_requests','vision_notifications','vision_escalations');
 select exists(select 1 from public.vision_module_definitions where id='views' and release_state='ACTIVE') into views_release_active;
 ready:=latest='0015_background_runtime.sql' and migration_count>=15 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,
   'tables_ok',tables_ok,'functions_ok',functions_ok,'rls_ok',rls_ok,
   'views_release_active',views_release_active,'architecture_version','2.0'
 );
end
$readiness_v20$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
