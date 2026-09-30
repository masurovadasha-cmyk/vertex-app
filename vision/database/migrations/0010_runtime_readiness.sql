-- VERTEX VISION Runtime Readiness 0.1
-- Minimal anonymous-safe schema readiness probe. No tenant/customer data is returned.
begin;

create function public.vision_runtime_readiness() returns jsonb
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
   and to_regclass('public.vision_module_definitions') is not null;

 functions_ok:=
   to_regprocedure('public.vision_views_command(jsonb)') is not null
   and to_regprocedure('public.vision_session_context(uuid,uuid)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null;

 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights');

 select exists(
   select 1 from public.vision_module_definitions
   where id='views' and release_state='ACTIVE'
 ) into views_release_active;

 ready:=latest='0010_runtime_readiness.sql'
   and migration_count>=10
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
   'architecture_version','1.5'
 );
end $$;

revoke all on function public.vision_runtime_readiness() from public;
grant execute on function public.vision_runtime_readiness() to anon,authenticated;

commit;
