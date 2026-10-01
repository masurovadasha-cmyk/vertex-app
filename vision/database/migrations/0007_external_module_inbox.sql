-- VERTEX VISION inbound event foundation for standalone external modules.
-- Taxi remains the source of truth. VISION stores only an inbox envelope and a bounded public ride projection.
-- Delivery is at-least-once; event_id is the deduplication key. All receive/claim/apply functions are server-only.
begin;

create table public.vision_inbox_events(
  event_id uuid primary key,
  module_id text not null references public.vision_module_definitions(id),
  event_type text not null,
  schema_version integer not null check(schema_version=1),
  tenant_id uuid not null,
  organization_id uuid not null,
  aggregate_id text not null check(length(aggregate_id) between 1 and 128),
  aggregate_version bigint not null check(aggregate_version>0),
  correlation_id uuid not null,
  occurred_at timestamptz not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  last_error text,
  foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id)
);

create index vision_inbox_pending
  on public.vision_inbox_events(module_id,received_at,event_id)
  where processed_at is null;

create table public.vision_taxi_ride_projections(
  tenant_id uuid not null,
  organization_id uuid not null,
  ride_id text not null check(length(ride_id) between 1 and 128),
  aggregate_version bigint not null check(aggregate_version>0),
  status text not null check(status in ('REQUESTED','DRIVER_ASSIGNED','STARTED','COMPLETED','CANCELLED')),
  driver_id text,
  vehicle_id text,
  last_event_id uuid not null,
  last_event_type text not null,
  correlation_id uuid not null,
  occurred_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,organization_id,ride_id),
  foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id)
);

alter table public.vision_inbox_events enable row level security;
alter table public.vision_taxi_ride_projections enable row level security;
revoke all on public.vision_inbox_events,public.vision_taxi_ride_projections from public,anon,authenticated;

create function public.vision_taxi_inbox_receive(event jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  eid uuid;
  tenant uuid;
  org uuid;
  correlation uuid;
  schema_v integer;
  aggregate_v bigint;
  aggregate text;
  kind text;
  happened timestamptz;
  body jsonb;
  inserted boolean;
  existing public.vision_inbox_events%rowtype;
begin
  if jsonb_typeof(event)<>'object' then raise exception 'invalid_event'; end if;
  begin
    eid:=(event->>'event_id')::uuid;
    tenant:=(event->>'tenant_id')::uuid;
    org:=(event->>'organization_id')::uuid;
    correlation:=(event->>'correlation_id')::uuid;
    schema_v:=(event->>'schema_version')::integer;
    aggregate_v:=(event->>'aggregate_version')::bigint;
    happened:=(event->>'occurred_at')::timestamptz;
  exception when others then
    raise exception 'invalid_event';
  end;
  kind:=event->>'event_type';
  aggregate:=event->>'aggregate_id';
  body:=event->'payload';
  if eid is null or tenant is null or org is null or correlation is null
     or schema_v<>1 or aggregate_v is null or aggregate_v<=0
     or happened is null or aggregate is null or length(aggregate) not between 1 and 128
     or jsonb_typeof(body)<>'object'
     or kind not in (
       'taxi.ride.v1.requested',
       'taxi.ride.v1.driver_assigned',
       'taxi.trip.v1.started',
       'taxi.trip.v1.completed',
       'taxi.ride.v1.cancelled',
       'taxi.payment.v1.completed',
       'taxi.safety.v1.incident_created'
     ) then
    raise exception 'invalid_event';
  end if;
  if coalesce(body->>'ride_id','')<>aggregate then raise exception 'aggregate_mismatch'; end if;

  insert into public.vision_inbox_events(
    event_id,module_id,event_type,schema_version,tenant_id,organization_id,
    aggregate_id,aggregate_version,correlation_id,occurred_at,payload
  ) values(
    eid,'taxi',kind,schema_v,tenant,org,aggregate,aggregate_v,correlation,happened,body
  ) on conflict(event_id) do nothing;
  get diagnostics inserted=row_count;
  if inserted then return true; end if;

  select * into existing from public.vision_inbox_events where event_id=eid;
  if existing.module_id<>'taxi'
     or existing.event_type<>kind
     or existing.schema_version<>schema_v
     or existing.tenant_id<>tenant
     or existing.organization_id<>org
     or existing.aggregate_id<>aggregate
     or existing.aggregate_version<>aggregate_v
     or existing.correlation_id<>correlation
     or existing.occurred_at<>happened
     or existing.payload<>body then
    raise exception 'event_id_conflict';
  end if;
  return false;
end $$;

create function public.vision_inbox_claim(module text,batch_size integer default 25)
returns setof public.vision_inbox_events
language sql security definer set search_path='' as $$
  with pending as (
    select event_id
    from public.vision_inbox_events
    where module_id=module
      and processed_at is null
      and (lease_until is null or lease_until<now())
    order by received_at,event_id
    for update skip locked
    limit greatest(1,least(batch_size,100))
  )
  update public.vision_inbox_events e
  set lease_token=gen_random_uuid(),
      lease_until=now()+interval '60 seconds',
      attempts=attempts+1,
      last_error=null
  from pending
  where e.event_id=pending.event_id
  returning e.*;
$$;

create function public.vision_taxi_inbox_apply(event uuid,token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  e public.vision_inbox_events%rowtype;
  projected_status text;
  projected_driver text;
  projected_vehicle text;
begin
  select * into e
  from public.vision_inbox_events
  where event_id=event
    and module_id='taxi'
    and processed_at is null
    and lease_token=token
    and lease_until>now()
  for update;
  if not found then return false; end if;

  if e.event_type='taxi.ride.v1.requested' then
    projected_status:='REQUESTED';
  elsif e.event_type='taxi.ride.v1.driver_assigned' then
    projected_status:='DRIVER_ASSIGNED';
    projected_driver:=nullif(e.payload->>'driver_id','');
    projected_vehicle:=nullif(e.payload->>'vehicle_id','');
    if projected_driver is null or projected_vehicle is null then raise exception 'invalid_event_payload'; end if;
  elsif e.event_type='taxi.trip.v1.started' then
    projected_status:='STARTED';
    projected_driver:=nullif(e.payload->>'driver_id','');
    if projected_driver is null then raise exception 'invalid_event_payload'; end if;
  elsif e.event_type='taxi.trip.v1.completed' then
    projected_status:='COMPLETED';
  elsif e.event_type='taxi.ride.v1.cancelled' then
    projected_status:='CANCELLED';
  end if;

  if projected_status is not null then
    insert into public.vision_taxi_ride_projections(
      tenant_id,organization_id,ride_id,aggregate_version,status,driver_id,vehicle_id,
      last_event_id,last_event_type,correlation_id,occurred_at
    ) values(
      e.tenant_id,e.organization_id,e.aggregate_id,e.aggregate_version,projected_status,
      projected_driver,projected_vehicle,e.event_id,e.event_type,e.correlation_id,e.occurred_at
    )
    on conflict(tenant_id,organization_id,ride_id) do update
    set aggregate_version=excluded.aggregate_version,
        status=excluded.status,
        driver_id=coalesce(excluded.driver_id,public.vision_taxi_ride_projections.driver_id),
        vehicle_id=coalesce(excluded.vehicle_id,public.vision_taxi_ride_projections.vehicle_id),
        last_event_id=excluded.last_event_id,
        last_event_type=excluded.last_event_type,
        correlation_id=excluded.correlation_id,
        occurred_at=excluded.occurred_at,
        updated_at=now()
    where excluded.aggregate_version>public.vision_taxi_ride_projections.aggregate_version;
  end if;

  update public.vision_inbox_events
  set processed_at=now(),lease_token=null,lease_until=null,last_error=null
  where event_id=e.event_id;
  return true;
exception when others then
  update public.vision_inbox_events
  set lease_token=null,lease_until=null,last_error=left(sqlerrm,500)
  where event_id=event and lease_token=token and processed_at is null;
  raise;
end $$;

revoke all on function public.vision_taxi_inbox_receive(jsonb) from public,anon,authenticated;
revoke all on function public.vision_inbox_claim(text,integer) from public,anon,authenticated;
revoke all on function public.vision_taxi_inbox_apply(uuid,uuid) from public,anon,authenticated;
-- Operator grants these functions only to the dedicated Event Gateway / inbox processor principal.

commit;
