-- VERTEX VISION / Views Operations 0.1
-- Transactional booking -> stay -> checkout -> cleaning -> ready vertical slice.
-- Staging first. No production migration is performed by the build.
begin;

insert into public.vision_permissions(code,description) values
 ('views.operations.read','Read Views operational properties, units, bookings and cleaning jobs'),
 ('views.booking.create','Create Views bookings'),
 ('views.booking.manage','Confirm, check in, check out and cancel Views bookings'),
 ('views.cleaning.execute','Start and submit internal Views cleaning jobs'),
 ('views.cleaning.verify','Verify internal Views cleaning jobs and return units to ready')
on conflict(code) do nothing;

create table public.vision_views_properties(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 code text not null,
 name text not null,
 timezone text not null default 'Asia/Tashkent',
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,organization_id,code),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id)
);

create table public.vision_views_units(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 property_id uuid not null,
 unit_number text not null,
 unit_type text,
 status text not null default 'READY' check(status in ('READY','OCCUPIED','CLEANING','MAINTENANCE','BLOCKED','INACTIVE')),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,property_id,unit_number),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,property_id) references public.vision_views_properties(tenant_id,id)
);

create table public.vision_views_bookings(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 unit_id uuid not null,
 customer_id uuid not null,
 public_no text not null,
 source text not null default 'direct',
 check_in date not null,
 check_out date not null,
 status text not null default 'PENDING' check(status in ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED','CANCELLED','NO_SHOW')),
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 total numeric(14,2) not null default 0 check(total>=0),
 amount_paid numeric(14,2) not null default 0 check(amount_paid>=0),
 version bigint not null default 1 check(version>0),
 correlation_id uuid not null default gen_random_uuid(),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,public_no),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,unit_id) references public.vision_views_units(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.vision_customers(tenant_id,id),
 foreign key(tenant_id,created_by) references public.vision_users(tenant_id,id),
 check(check_out>check_in)
);

create table public.vision_views_stays(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 booking_id uuid not null,
 status text not null default 'SCHEDULED' check(status in ('SCHEDULED','IN_HOUSE','COMPLETED')),
 actual_check_in timestamptz,
 actual_check_out timestamptz,
 checked_in_by uuid,
 checked_out_by uuid,
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,booking_id),
 foreign key(tenant_id,booking_id) references public.vision_views_bookings(tenant_id,id),
 foreign key(tenant_id,checked_in_by) references public.vision_users(tenant_id,id),
 foreign key(tenant_id,checked_out_by) references public.vision_users(tenant_id,id)
);

create table public.vision_views_cleaning_jobs(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 unit_id uuid not null,
 booking_id uuid not null,
 status text not null default 'REQUIRED' check(status in ('REQUIRED','IN_PROGRESS','INSPECTION','VERIFIED')),
 version bigint not null default 1 check(version>0),
 started_at timestamptz,
 submitted_at timestamptz,
 verified_at timestamptz,
 verified_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,booking_id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,unit_id) references public.vision_views_units(tenant_id,id),
 foreign key(tenant_id,booking_id) references public.vision_views_bookings(tenant_id,id),
 foreign key(tenant_id,verified_by) references public.vision_users(tenant_id,id)
);

create index vision_views_booking_calendar_idx on public.vision_views_bookings(tenant_id,unit_id,check_in,check_out,status);
create index vision_views_booking_customer_idx on public.vision_views_bookings(tenant_id,customer_id,created_at desc);
create index vision_views_cleaning_queue_idx on public.vision_views_cleaning_jobs(tenant_id,organization_id,status,created_at);
create index vision_views_unit_status_idx on public.vision_views_units(tenant_id,organization_id,status);

alter table public.vision_views_properties enable row level security;
alter table public.vision_views_units enable row level security;
alter table public.vision_views_bookings enable row level security;
alter table public.vision_views_stays enable row level security;
alter table public.vision_views_cleaning_jobs enable row level security;

revoke all on public.vision_views_properties,public.vision_views_units,public.vision_views_bookings,
 public.vision_views_stays,public.vision_views_cleaning_jobs from public,anon,authenticated;
grant select on public.vision_views_properties,public.vision_views_units,public.vision_views_bookings,
 public.vision_views_stays,public.vision_views_cleaning_jobs to authenticated;

create function vision_private.read_views_booking(bid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.vision_views_bookings b
   where b.id=bid and (
     vision_private.guest_owns(b.tenant_id,b.customer_id,b.organization_id)
     or vision_private.permitted(b.tenant_id,b.organization_id,'views.operations.read')
   )
 );
$$;
revoke all on function vision_private.read_views_booking(uuid) from public,anon,authenticated;
grant execute on function vision_private.read_views_booking(uuid) to authenticated;

create policy vision_views_property_read on public.vision_views_properties for select to authenticated
 using(vision_private.permitted(tenant_id,organization_id,'views.operations.read'));
create policy vision_views_unit_read on public.vision_views_units for select to authenticated
 using(vision_private.permitted(tenant_id,organization_id,'views.operations.read'));
create policy vision_views_booking_read on public.vision_views_bookings for select to authenticated
 using(vision_private.read_views_booking(id));
create policy vision_views_stay_read on public.vision_views_stays for select to authenticated
 using(vision_private.read_views_booking(booking_id));
create policy vision_views_cleaning_read on public.vision_views_cleaning_jobs for select to authenticated
 using(
   vision_private.permitted(tenant_id,organization_id,'views.operations.read')
   or vision_private.permitted(tenant_id,organization_id,'views.cleaning.execute')
   or vision_private.permitted(tenant_id,organization_id,'views.cleaning.verify')
 );

create function public.vision_views_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=vision_private.actor(); tenant uuid; kind text; idem text; org uuid;
 receipt public.vision_command_receipts;
 b public.vision_views_bookings; u public.vision_views_units; job public.vision_views_cleaning_jobs;
 customer uuid; unit uuid; booking uuid; cleaning uuid;
 expected bigint; ci date; co date; source_name text; curr text; amount numeric;
 old_status text; event_name text; event_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid();
 response jsonb; payload jsonb; allowed boolean:=false;
begin
 if jsonb_typeof(command) is distinct from 'object' or exists(
   select 1 from jsonb_object_keys(command) k where k not in
   ('type','tenant_id','idempotency_key','organization_id','booking_id','cleaning_job_id',
    'expected_version','unit_id','customer_id','check_in','check_out','source','total','currency')
 ) then raise exception 'invalid_command' using errcode='22023'; end if;

 tenant:=(command->>'tenant_id')::uuid;
 kind:=command->>'type';
 idem:=command->>'idempotency_key';
 if actor is null or tenant is null or not vision_private.active_actor(tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if idem is null or length(idem) not between 1 and 128 or kind is null then
   raise exception 'invalid_command' using errcode='22023';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||idem,0));

 if kind='create_booking' then
   org:=(command->>'organization_id')::uuid;
   allowed:=vision_private.permitted(tenant,org,'views.booking.create');
 elsif kind in ('confirm_booking','check_in','check_out','cancel_booking') then
   booking:=(command->>'booking_id')::uuid;
   select * into b from public.vision_views_bookings where id=booking and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   org:=b.organization_id;
   allowed:=vision_private.permitted(tenant,org,'views.booking.manage');
 elsif kind in ('cleaning_start','cleaning_submit','cleaning_verify') then
   cleaning:=(command->>'cleaning_job_id')::uuid;
   select * into job from public.vision_views_cleaning_jobs where id=cleaning and tenant_id=tenant for update;
   if not found then raise exception 'forbidden' using errcode='42501'; end if;
   org:=job.organization_id;
   allowed:=case when kind='cleaning_verify'
     then vision_private.permitted(tenant,org,'views.cleaning.verify')
     else vision_private.permitted(tenant,org,'views.cleaning.execute') end;
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

 if kind='create_booking' then
   unit:=(command->>'unit_id')::uuid; customer:=(command->>'customer_id')::uuid;
   ci:=(command->>'check_in')::date; co:=(command->>'check_out')::date;
   source_name:=coalesce(nullif(command->>'source',''),'direct');
   curr:=coalesce(nullif(command->>'currency',''),'USD');
   amount:=coalesce((command->>'total')::numeric,0);
   if ci is null or co is null or co<=ci or length(source_name)>32 or curr !~ '^[A-Z]{3}$' or amount<0 then
     raise exception 'invalid_booking' using errcode='22023';
   end if;
   select * into u from public.vision_views_units
   where id=unit and tenant_id=tenant and organization_id=org and status<>'INACTIVE';
   if not found or not exists(select 1 from public.vision_customers c where c.id=customer and c.tenant_id=tenant and c.status='ACTIVE') then
     raise exception 'invalid_unit_or_customer' using errcode='22023';
   end if;
   insert into public.vision_views_bookings(
     tenant_id,organization_id,unit_id,customer_id,public_no,source,check_in,check_out,currency,total,created_by
   ) values(
     tenant,org,unit,customer,'VB-'||substr(gen_random_uuid()::text,1,8),source_name,ci,co,curr,amount,actor
   ) returning * into b;
   insert into public.vision_views_stays(tenant_id,booking_id) values(tenant,b.id);
   event_name:='views.booking.created';

 elsif kind='confirm_booking' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from b.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if b.status<>'PENDING' then raise exception 'invalid_transition' using errcode='22023'; end if;
   perform pg_advisory_xact_lock(hashtextextended(tenant::text||b.unit_id::text,1));
   if exists(
     select 1 from public.vision_views_bookings other
     where other.tenant_id=tenant and other.unit_id=b.unit_id and other.id<>b.id
       and other.status in ('CONFIRMED','CHECKED_IN')
       and other.check_in<b.check_out and other.check_out>b.check_in
   ) then raise exception 'booking_conflict' using errcode='23505'; end if;
   old_status:=b.status;
   update public.vision_views_bookings set status='CONFIRMED',version=version+1,updated_at=now()
   where id=b.id returning * into b;
   event_name:='views.booking.confirmed';

 elsif kind='check_in' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from b.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if b.status<>'CONFIRMED' then raise exception 'invalid_transition' using errcode='22023'; end if;
   select * into u from public.vision_views_units where tenant_id=tenant and id=b.unit_id for update;
   if u.status in ('OCCUPIED','CLEANING','MAINTENANCE','BLOCKED','INACTIVE') then
     raise exception 'unit_not_ready' using errcode='22023';
   end if;
   old_status:=b.status;
   update public.vision_views_bookings set status='CHECKED_IN',version=version+1,updated_at=now()
   where id=b.id returning * into b;
   update public.vision_views_units set status='OCCUPIED',version=version+1,updated_at=now() where id=b.unit_id returning * into u;
   update public.vision_views_stays set status='IN_HOUSE',actual_check_in=now(),checked_in_by=actor where booking_id=b.id and tenant_id=tenant;
   event_name:='views.booking.checked_in';

 elsif kind='check_out' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from b.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if b.status<>'CHECKED_IN' then raise exception 'invalid_transition' using errcode='22023'; end if;
   old_status:=b.status;
   update public.vision_views_bookings set status='CHECKED_OUT',version=version+1,updated_at=now()
   where id=b.id returning * into b;
   update public.vision_views_units set status='CLEANING',version=version+1,updated_at=now() where tenant_id=tenant and id=b.unit_id returning * into u;
   update public.vision_views_stays set status='COMPLETED',actual_check_out=now(),checked_out_by=actor where booking_id=b.id and tenant_id=tenant;
   insert into public.vision_views_cleaning_jobs(tenant_id,organization_id,unit_id,booking_id)
   values(tenant,b.organization_id,b.unit_id,b.id) returning * into job;
   event_name:='views.booking.checked_out';

 elsif kind='cancel_booking' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from b.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if b.status not in ('PENDING','CONFIRMED') then raise exception 'invalid_transition' using errcode='22023'; end if;
   old_status:=b.status;
   update public.vision_views_bookings set status='CANCELLED',version=version+1,updated_at=now()
   where id=b.id returning * into b;
   event_name:='views.booking.cancelled';

 elsif kind='cleaning_start' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from job.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if job.status<>'REQUIRED' then raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_views_cleaning_jobs set status='IN_PROGRESS',version=version+1,started_at=now(),updated_at=now()
   where id=job.id returning * into job;
   select * into b from public.vision_views_bookings where tenant_id=tenant and id=job.booking_id;
   event_name:='views.cleaning.started';

 elsif kind='cleaning_submit' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from job.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if job.status<>'IN_PROGRESS' then raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_views_cleaning_jobs set status='INSPECTION',version=version+1,submitted_at=now(),updated_at=now()
   where id=job.id returning * into job;
   select * into b from public.vision_views_bookings where tenant_id=tenant and id=job.booking_id;
   event_name:='views.cleaning.submitted';

 elsif kind='cleaning_verify' then
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from job.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if job.status<>'INSPECTION' then raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_views_cleaning_jobs set status='VERIFIED',version=version+1,verified_at=now(),verified_by=actor,updated_at=now()
   where id=job.id returning * into job;
   select * into b from public.vision_views_bookings where tenant_id=tenant and id=job.booking_id for update;
   update public.vision_views_units set status='READY',version=version+1,updated_at=now() where tenant_id=tenant and id=job.unit_id returning * into u;
   if b.status='CHECKED_OUT' then
     update public.vision_views_bookings set status='COMPLETED',version=version+1,updated_at=now() where id=b.id returning * into b;
   end if;
   event_name:='views.cleaning.verified';
 end if;

 payload:=jsonb_build_object(
   'event_id',event_id,'tenant_id',tenant,'organization_id',org,
   'booking_id',b.id,'unit_id',b.unit_id,'correlation_id',b.correlation_id,
   'occurred_at',now(),'status',b.status,'version',b.version
 );
 if job.id is not null then payload:=payload||jsonb_build_object('cleaning_job_id',job.id,'cleaning_status',job.status,'cleaning_version',job.version); end if;

 insert into public.vision_audit_events(tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload)
 values(tenant,org,actor,event_name,case when kind like 'cleaning_%' then 'cleaning_job' else 'booking' end,
        case when kind like 'cleaning_%' then job.id else b.id end,request_id,b.correlation_id,payload);
 insert into public.vision_outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
 values(event_id,tenant,event_name,case when kind like 'cleaning_%' then 'cleaning_job' else 'booking' end,
        case when kind like 'cleaning_%' then job.id else b.id end,b.correlation_id,payload);

 if kind='check_out' then
   insert into public.vision_outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
   values(tenant,'views.cleaning.required','cleaning_job',job.id,b.correlation_id,
     payload||jsonb_build_object('event_id',gen_random_uuid(),'cleaning_job_id',job.id,'cleaning_status',job.status));
 end if;

 response:=jsonb_build_object(
   'booking_id',b.id,'booking_status',b.status,'booking_version',b.version,
   'unit_id',b.unit_id,'correlation_id',b.correlation_id
 );
 if job.id is not null then response:=response||jsonb_build_object('cleaning_job_id',job.id,'cleaning_status',job.status,'cleaning_version',job.version); end if;
 insert into public.vision_command_receipts(tenant_id,actor_user_id,idempotency_key,command,response)
 values(tenant,actor,idem,command,response);
 return response;
end $$;

revoke all on function public.vision_views_command(jsonb) from public,anon;
grant execute on function public.vision_views_command(jsonb) to authenticated;

commit;
