-- VERTEX VISION Event Reliability / Inbox 0.1
-- Durable idempotency boundary for future at-least-once event consumers.
begin;

create table public.vision_event_inbox(
 tenant_id uuid not null references public.vision_tenants(id),
 consumer text not null check(consumer ~ '^[a-z][a-z0-9.-]{0,127}$'),
 event_id uuid not null,
 event_type text not null check(event_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
 aggregate_type text not null check(aggregate_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
 aggregate_id uuid not null,
 correlation_id uuid not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'PROCESSING' check(status in ('PROCESSING','FAILED','PROCESSED')),
 attempts integer not null default 1 check(attempts>0),
 lease_token uuid,
 lease_until timestamptz,
 first_received_at timestamptz not null default now(),
 last_received_at timestamptz not null default now(),
 processed_at timestamptz,
 last_error_code text check(last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$'),
 primary key(tenant_id,consumer,event_id)
);
create index vision_event_inbox_retry on public.vision_event_inbox(status,lease_until,last_received_at)
 where status<>'PROCESSED';
alter table public.vision_event_inbox enable row level security;
revoke all on public.vision_event_inbox from public,anon,authenticated;

create function public.vision_inbox_begin(
 p_tenant uuid,p_consumer text,p_event_id uuid,p_event_type text,
 p_aggregate_type text,p_aggregate_id uuid,p_correlation_id uuid,p_payload_sha256 text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 item public.vision_event_inbox;
 token uuid:=gen_random_uuid();
begin
 if p_tenant is null or p_event_id is null or p_aggregate_id is null or p_correlation_id is null
    or p_consumer !~ '^[a-z][a-z0-9.-]{0,127}$'
    or p_event_type !~ '^[a-z][a-z0-9._-]{0,127}$'
    or p_aggregate_type !~ '^[a-z][a-z0-9._-]{0,127}$'
    or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.vision_tenants where id=p_tenant) then
   raise exception 'invalid_event_envelope' using errcode='22023';
 end if;

 insert into public.vision_event_inbox(
  tenant_id,consumer,event_id,event_type,aggregate_type,aggregate_id,correlation_id,
  payload_sha256,status,lease_token,lease_until
 ) values(
  p_tenant,p_consumer,p_event_id,p_event_type,p_aggregate_type,p_aggregate_id,p_correlation_id,
  p_payload_sha256,'PROCESSING',token,now()+interval '60 seconds'
 ) on conflict do nothing
 returning * into item;

 if found then
   return jsonb_build_object('claimed',true,'status',item.status,'attempts',item.attempts,'lease_token',item.lease_token);
 end if;

 select * into item from public.vision_event_inbox
 where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
 for update;

 if (item.event_type,item.aggregate_type,item.aggregate_id,item.correlation_id,item.payload_sha256)
    is distinct from
    (p_event_type,p_aggregate_type,p_aggregate_id,p_correlation_id,p_payload_sha256) then
   raise exception 'event_identity_conflict' using errcode='23505';
 end if;

 if item.status='PROCESSED' then
   update public.vision_event_inbox set attempts=attempts+1,last_received_at=now()
   where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
   returning * into item;
   return jsonb_build_object('claimed',false,'status',item.status,'attempts',item.attempts,'lease_token',null);
 end if;

 if item.status='PROCESSING' and item.lease_until>=now() then
   update public.vision_event_inbox set attempts=attempts+1,last_received_at=now()
   where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
   returning * into item;
   return jsonb_build_object('claimed',false,'status',item.status,'attempts',item.attempts,'lease_token',null);
 end if;

 token:=gen_random_uuid();
 update public.vision_event_inbox set
   status='PROCESSING',attempts=attempts+1,last_received_at=now(),
   lease_token=token,lease_until=now()+interval '60 seconds',last_error_code=null
 where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
 returning * into item;
 return jsonb_build_object('claimed',true,'status',item.status,'attempts',item.attempts,'lease_token',item.lease_token);
end $$;

create function public.vision_inbox_complete(p_tenant uuid,p_consumer text,p_event_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.vision_event_inbox set
   status='PROCESSED',processed_at=now(),lease_token=null,lease_until=null,last_error_code=null
 where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
   and status='PROCESSING' and lease_token=p_lease_token and lease_until>=now();
 return found;
end $$;

create function public.vision_inbox_fail(p_tenant uuid,p_consumer text,p_event_id uuid,p_lease_token uuid,p_error_code text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_error_code !~ '^[A-Z0-9_]{1,64}$' then
   raise exception 'invalid_error_code' using errcode='22023';
 end if;
 update public.vision_event_inbox set
   status='FAILED',lease_token=null,lease_until=null,last_error_code=p_error_code
 where tenant_id=p_tenant and consumer=p_consumer and event_id=p_event_id
   and status='PROCESSING' and lease_token=p_lease_token;
 return found;
end $$;

revoke all on function public.vision_inbox_begin(uuid,text,uuid,text,text,uuid,uuid,text),
 public.vision_inbox_complete(uuid,text,uuid,uuid),
 public.vision_inbox_fail(uuid,text,uuid,uuid,text)
 from public,anon,authenticated;
-- Operator grants these functions only to dedicated NOINHERIT consumer principals.

-- Readiness now includes the event-consumer durability boundary.
create or replace function public.vision_runtime_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
   and to_regclass('public.vision_event_inbox') is not null;
 functions_ok:=
   to_regprocedure('public.vision_views_command(jsonb)') is not null
   and to_regprocedure('public.vision_session_context(uuid,uuid)') is not null
   and to_regprocedure('public.vision_runtime_readiness()') is not null
   and to_regprocedure('public.vision_inbox_begin(uuid,text,uuid,text,text,uuid,uuid,text)') is not null
   and to_regprocedure('public.vision_inbox_complete(uuid,text,uuid,uuid)') is not null
   and to_regprocedure('public.vision_inbox_fail(uuid,text,uuid,uuid,text)') is not null;
 select coalesce(bool_and(c.relrowsecurity),false) into rls_ok
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in
   ('vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights','vision_event_inbox');
 select exists(select 1 from public.vision_module_definitions where id='views' and release_state='ACTIVE') into views_release_active;
 ready:=latest='0011_event_inbox.sql' and migration_count>=11 and tables_ok and functions_ok and rls_ok and views_release_active;
 return jsonb_build_object(
   'ready',ready,'latest_migration',latest,'migration_count',migration_count,
   'tables_ok',tables_ok,'functions_ok',functions_ok,'rls_ok',rls_ok,
   'views_release_active',views_release_active,'architecture_version','1.6'
 );
end $$;

commit;
