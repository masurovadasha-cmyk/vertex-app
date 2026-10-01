-- VERTEX VISION Staging Session Activation 0.1
-- Authenticated scope discovery for the active Views module.
begin;

create function public.vision_session_scopes() returns jsonb
language plpgsql stable security definer set search_path='' as $vision_session_scopes$
declare
 actor uuid:=vision_private.actor();
 scopes jsonb;
begin
 if actor is null then
   raise exception 'forbidden' using errcode='42501';
 end if;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.organization_name,x.organization_id),'[]'::jsonb)
 into scopes
 from (
   select
     u.tenant_id,
     o.id as organization_id,
     o.name as organization_name,
     exists(
       select 1
       from public.vision_memberships m
       join public.vision_membership_roles mr
         on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
       join public.vision_role_permissions rp on rp.role_id=mr.role_id
       where m.tenant_id=u.tenant_id
         and m.organization_id=o.id
         and m.user_id=actor
         and m.status='ACTIVE'
     ) as member_authorized,
     exists(
       select 1
       from public.vision_guest_links g
       where g.tenant_id=u.tenant_id
         and g.requester_organization_id=o.id
         and g.user_id=actor
         and g.active
     ) as guest_linked
   from public.vision_users u
   join public.vision_organizations o on o.tenant_id=u.tenant_id and o.status='ACTIVE'
   where u.id=actor
     and u.status='ACTIVE'
     and vision_private.views_module_enabled(u.tenant_id,o.id)
     and (
       exists(
         select 1
         from public.vision_memberships m
         join public.vision_membership_roles mr
           on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
         join public.vision_role_permissions rp on rp.role_id=mr.role_id
         where m.tenant_id=u.tenant_id
           and m.organization_id=o.id
           and m.user_id=actor
           and m.status='ACTIVE'
       )
       or exists(
         select 1
         from public.vision_guest_links g
         where g.tenant_id=u.tenant_id
           and g.requester_organization_id=o.id
           and g.user_id=actor
           and g.active
       )
     )
 ) x;

 return jsonb_build_object('actor_id',actor,'module','views','scopes',scopes);
end
$vision_session_scopes$;

revoke all on function public.vision_session_scopes() from public,anon;
grant execute on function public.vision_session_scopes() to authenticated;

create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $readiness_v21$
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
   and to_regprocedure('public.vision_session_scopes()') is not null
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
 ready:=latest='0016_staging_session_activation.sql' and migration_count>=16 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,
   'tables_ok',tables_ok,'functions_ok',functions_ok,'rls_ok',rls_ok,
   'views_release_active',views_release_active,'architecture_version','2.1'
 );
end
$readiness_v21$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
