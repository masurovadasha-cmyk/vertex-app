-- VERTEX VISION Views RC 0.1 domain layer.
-- Adds operational Views data without creating a payment ledger or production deployment.
begin;

insert into public.vision_permissions(code,description) values
 ('views.unit.read','Read Views units'),
 ('views.unit.manage','Manage Views units'),
 ('views.guest.read','Read Views guest directory'),
 ('views.guest.manage','Manage Views guest directory'),
 ('views.booking.read','Read Views bookings and calendar'),
 ('views.booking.manage','Create and manage Views bookings'),
 ('views.stay.manage','Perform Views check-in and check-out'),
 ('views.maintenance.read','Read Views maintenance requests'),
 ('views.maintenance.manage','Manage Views maintenance workflow'),
 ('views.maintenance.assigned','Work assigned Views maintenance requests'),
 ('views.finance.read','Read booking gross finance summaries')
on conflict(code) do nothing;

create table public.vision_views_units(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 code text not null check(length(code) between 1 and 64),
 name text not null check(length(name) between 1 and 160),
 unit_type text not null default 'APARTMENT' check(unit_type in ('APARTMENT','STUDIO','ROOM','HOUSE','VILLA','OTHER')),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','MAINTENANCE')),
 max_guests integer not null default 2 check(max_guests between 1 and 50),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,organization_id,code),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id)
);

create table public.vision_views_guests(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 customer_id uuid not null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,organization_id,customer_id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.vision_customers(tenant_id,id)
);

create table public.vision_views_bookings(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 unit_id uuid not null,
 guest_id uuid not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED')),
 arrival date not null,
 departure date not null,
 adults integer not null default 1 check(adults between 1 and 50),
 children integer not null default 0 check(children between 0 and 50),
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 total_minor bigint check(total_minor is null or total_minor>=0),
 source text not null default 'DIRECT' check(length(source) between 1 and 40),
 version bigint not null default 1 check(version>0),
 correlation_id uuid not null default gen_random_uuid(),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(departure>arrival),
 unique(tenant_id,id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,unit_id) references public.vision_views_units(tenant_id,id),
 foreign key(tenant_id,guest_id) references public.vision_views_guests(tenant_id,id),
 foreign key(tenant_id,created_by) references public.vision_users(tenant_id,id)
);

create table public.vision_views_booking_history(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 booking_id uuid not null,
 from_status text,
 to_status text not null,
 actor_user_id uuid not null,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,booking_id) references public.vision_views_bookings(tenant_id,id),
 foreign key(tenant_id,actor_user_id) references public.vision_users(tenant_id,id)
);

create table public.vision_views_maintenance(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 organization_id uuid not null,
 unit_id uuid not null,
 title text not null check(length(title) between 1 and 240),
 category text not null default 'GENERAL' check(category in ('GENERAL','ELECTRICAL','PLUMBING','HVAC','CARPENTRY','APPLIANCE','SAFETY','OTHER')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
 status text not null default 'OPEN' check(status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
 assigned_user_id uuid,
 version bigint not null default 1 check(version>0),
 correlation_id uuid not null default gen_random_uuid(),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,organization_id) references public.vision_organizations(tenant_id,id),
 foreign key(tenant_id,unit_id) references public.vision_views_units(tenant_id,id),
 foreign key(tenant_id,assigned_user_id) references public.vision_users(tenant_id,id),
 foreign key(tenant_id,created_by) references public.vision_users(tenant_id,id)
);

create table public.vision_views_command_receipts(
 tenant_id uuid not null,
 actor_user_id uuid not null,
 idempotency_key text not null,
 command jsonb not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(tenant_id,actor_user_id,idempotency_key),
 foreign key(tenant_id,actor_user_id) references public.vision_users(tenant_id,id)
);

create index vision_views_booking_calendar_idx on public.vision_views_bookings(tenant_id,organization_id,arrival,departure,status);
create index vision_views_booking_unit_idx on public.vision_views_bookings(tenant_id,unit_id,status,arrival,departure);
create index vision_views_maintenance_idx on public.vision_views_maintenance(tenant_id,organization_id,status,priority,created_at desc);

alter table public.vision_views_units enable row level security;
alter table public.vision_views_guests enable row level security;
alter table public.vision_views_bookings enable row level security;
alter table public.vision_views_booking_history enable row level security;
alter table public.vision_views_maintenance enable row level security;
alter table public.vision_views_command_receipts enable row level security;

revoke all on public.vision_views_units,public.vision_views_guests,public.vision_views_bookings,
 public.vision_views_booking_history,public.vision_views_maintenance,public.vision_views_command_receipts
 from public,anon,authenticated;

create function vision_private.read_views_guest(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.vision_views_guests g
   where g.id=gid and (
     vision_private.permitted(g.tenant_id,g.organization_id,'views.guest.read')
     or vision_private.guest_owns(g.tenant_id,g.customer_id,g.organization_id)
   )
 );
$$;

create function vision_private.read_views_booking(bid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1
   from public.vision_views_bookings b
   join public.vision_views_guests g on (g.tenant_id,g.id)=(b.tenant_id,b.guest_id)
   where b.id=bid and (
     vision_private.permitted(b.tenant_id,b.organization_id,'views.booking.read')
     or vision_private.permitted(b.tenant_id,b.organization_id,'views.finance.read')
     or vision_private.guest_owns(b.tenant_id,g.customer_id,b.organization_id)
   )
 );
$$;

create function vision_private.read_views_customer(cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.vision_views_guests g
   where g.customer_id=cid and (
     vision_private.permitted(g.tenant_id,g.organization_id,'views.guest.read')
     or vision_private.guest_owns(g.tenant_id,g.customer_id,g.organization_id)
   )
 );
$$;

revoke all on function vision_private.read_views_guest(uuid),vision_private.read_views_booking(uuid),vision_private.read_views_customer(uuid)
 from public,anon,authenticated;
grant execute on function vision_private.read_views_guest(uuid),vision_private.read_views_booking(uuid),vision_private.read_views_customer(uuid)
 to authenticated;

grant select on public.vision_views_units,public.vision_views_guests,public.vision_views_bookings,
 public.vision_views_booking_history,public.vision_views_maintenance,public.vision_customers to authenticated;

create policy vision_views_unit_read on public.vision_views_units for select to authenticated using(
 vision_private.permitted(tenant_id,organization_id,'views.unit.read')
);
create policy vision_views_guest_read on public.vision_views_guests for select to authenticated using(
 vision_private.read_views_guest(id)
);
create policy vision_views_booking_read on public.vision_views_bookings for select to authenticated using(
 vision_private.read_views_booking(id)
);
create policy vision_views_booking_history_read on public.vision_views_booking_history for select to authenticated using(
 vision_private.read_views_booking(booking_id)
);
create policy vision_views_maintenance_read on public.vision_views_maintenance for select to authenticated using(
 vision_private.permitted(tenant_id,organization_id,'views.maintenance.read')
 or vision_private.permitted(tenant_id,organization_id,'views.maintenance.manage')
 or (assigned_user_id=vision_private.actor() and vision_private.permitted(tenant_id,organization_id,'views.maintenance.assigned'))
);
create policy vision_views_customer_read on public.vision_customers for select to authenticated using(
 vision_private.read_views_customer(id)
);

create trigger vision_views_booking_history_immutable before update or delete on public.vision_views_booking_history
 for each row execute function vision_private.immutable_record();
create trigger vision_views_receipt_immutable before update or delete on public.vision_views_command_receipts
 for each row execute function vision_private.immutable_record();

create view public.vision_views_guest_directory with (security_invoker=true) as
 select g.tenant_id,g.organization_id,g.id as guest_id,g.customer_id,c.display_name,g.status,g.created_at,g.updated_at
 from public.vision_views_guests g
 join public.vision_customers c on (c.tenant_id,c.id)=(g.tenant_id,g.customer_id);

create view public.vision_views_calendar with (security_invoker=true) as
 select b.tenant_id,b.organization_id,b.id as booking_id,b.unit_id,u.code as unit_code,u.name as unit_name,
        b.guest_id,c.display_name as guest_name,b.status,b.arrival,b.departure,b.adults,b.children,b.source,b.version
 from public.vision_views_bookings b
 join public.vision_views_units u on (u.tenant_id,u.id)=(b.tenant_id,b.unit_id)
 join public.vision_views_guests g on (g.tenant_id,g.id)=(b.tenant_id,b.guest_id)
 join public.vision_customers c on (c.tenant_id,c.id)=(g.tenant_id,g.customer_id)
 where b.status<>'CANCELLED';

create view public.vision_views_finance_monthly with (security_invoker=true) as
 select tenant_id,organization_id,date_trunc('month',arrival::timestamp)::date as month,currency,
        count(*)::bigint as booking_count,
        coalesce(sum(total_minor) filter(where total_minor is not null),0)::bigint as booking_gross_minor,
        count(*) filter(where total_minor is null)::bigint as unpriced_booking_count
 from public.vision_views_bookings
 where status in ('CONFIRMED','CHECKED_IN','CHECKED_OUT')
 group by tenant_id,organization_id,date_trunc('month',arrival::timestamp)::date,currency;

create view public.vision_views_dashboard with (security_invoker=true) as
 select u.tenant_id,u.organization_id,
        count(*) filter(where u.status='ACTIVE')::bigint as active_units,
        count(*) filter(where exists(
          select 1 from public.vision_views_bookings b
          where b.tenant_id=u.tenant_id and b.organization_id=u.organization_id and b.unit_id=u.id
            and b.status='CHECKED_IN'
        ))::bigint as occupied_units,
        (select count(*) from public.vision_views_bookings b
          where b.tenant_id=u.tenant_id and b.organization_id=u.organization_id
            and b.arrival=current_date and b.status='CONFIRMED')::bigint as arrivals_today,
        (select count(*) from public.vision_views_bookings b
          where b.tenant_id=u.tenant_id and b.organization_id=u.organization_id
            and b.departure=current_date and b.status='CHECKED_IN')::bigint as departures_today,
        (select count(*) from public.vision_views_maintenance m
          where m.tenant_id=u.tenant_id and m.organization_id=u.organization_id
            and m.status in ('OPEN','ASSIGNED','IN_PROGRESS'))::bigint as open_maintenance
 from public.vision_views_units u
 group by u.tenant_id,u.organization_id;

revoke all on public.vision_views_guest_directory,public.vision_views_calendar,
 public.vision_views_finance_monthly,public.vision_views_dashboard from public,anon,authenticated;
grant select on public.vision_views_guest_directory,public.vision_views_calendar,
 public.vision_views_finance_monthly,public.vision_views_dashboard to authenticated;

create function public.vision_views_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=vision_private.actor(); tenant uuid; org uuid; kind text; idem text;
 allowed boolean:=false; receipt public.vision_views_command_receipts;
 u public.vision_views_units; g public.vision_views_guests; b public.vision_views_bookings; m public.vision_views_maintenance;
 customer uuid; assignee uuid; old_status text; event_name text; entity_type text; entity_id uuid;
 event_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); correlation uuid:=gen_random_uuid();
 response jsonb; payload jsonb; expected bigint; status_text text; version_value bigint:=1;
 arrival_date date; departure_date date; adults_count integer; children_count integer; total_value bigint;
begin
 if jsonb_typeof(command) is distinct from 'object' or exists(
   select 1 from jsonb_object_keys(command) k where k not in
   ('type','tenant_id','organization_id','idempotency_key','unit_id','guest_id','booking_id','maintenance_id',
    'expected_version','code','name','unit_type','max_guests','display_name','arrival','departure','adults','children',
    'currency','total_minor','source','title','category','priority','assignee_user_id')
 ) then raise exception 'invalid_command' using errcode='22023'; end if;

 tenant:=(command->>'tenant_id')::uuid;
 org:=(command->>'organization_id')::uuid;
 kind:=command->>'type';
 idem:=command->>'idempotency_key';
 if actor is null or tenant is null or org is null or not vision_private.active_actor(tenant)
    or not exists(select 1 from public.vision_organizations o where o.tenant_id=tenant and o.id=org and o.status='ACTIVE') then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if idem is null or length(idem) not between 1 and 128 or kind is null then
   raise exception 'invalid_command' using errcode='22023';
 end if;

 allowed:=case kind
   when 'unit.create' then vision_private.permitted(tenant,org,'views.unit.manage')
   when 'guest.create' then vision_private.permitted(tenant,org,'views.guest.manage')
   when 'booking.create' then vision_private.permitted(tenant,org,'views.booking.manage')
   when 'booking.confirm' then vision_private.permitted(tenant,org,'views.booking.manage')
   when 'booking.cancel' then vision_private.permitted(tenant,org,'views.booking.manage')
   when 'stay.check_in' then vision_private.permitted(tenant,org,'views.stay.manage')
   when 'stay.check_out' then vision_private.permitted(tenant,org,'views.stay.manage')
   when 'maintenance.create' then vision_private.permitted(tenant,org,'views.maintenance.manage')
   when 'maintenance.assign' then vision_private.permitted(tenant,org,'views.maintenance.manage')
   when 'maintenance.start' then vision_private.permitted(tenant,org,'views.maintenance.manage')
   when 'maintenance.complete' then vision_private.permitted(tenant,org,'views.maintenance.manage')
   else false end;
 if allowed is distinct from true then raise exception 'forbidden' using errcode='42501'; end if;

 perform pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||idem,0));
 select * into receipt from public.vision_views_command_receipts r
 where r.tenant_id=tenant and r.actor_user_id=actor and r.idempotency_key=idem;
 if found then
   if receipt.command<>command then raise exception 'idempotency_conflict' using errcode='23505'; end if;
   return receipt.response;
 end if;

 if kind='unit.create' then
   if coalesce(length(btrim(command->>'code')),0) not between 1 and 64
      or coalesce(length(btrim(command->>'name')),0) not between 1 and 160 then
     raise exception 'invalid_unit' using errcode='22023';
   end if;
   insert into public.vision_views_units(tenant_id,organization_id,code,name,unit_type,max_guests)
   values(tenant,org,btrim(command->>'code'),btrim(command->>'name'),
          coalesce(command->>'unit_type','APARTMENT'),coalesce((command->>'max_guests')::integer,2))
   returning * into u;
   entity_type:='views_unit'; entity_id:=u.id; event_name:='views.unit.v1.created'; status_text:=u.status; version_value:=u.version;
   response:=jsonb_build_object('unit_id',u.id,'status',u.status,'version',u.version);

 elsif kind='guest.create' then
   if coalesce(length(btrim(command->>'display_name')),0) not between 1 and 160 then
     raise exception 'invalid_guest' using errcode='22023';
   end if;
   insert into public.vision_customers(tenant_id,display_name)
   values(tenant,btrim(command->>'display_name')) returning id into customer;
   insert into public.vision_views_guests(tenant_id,organization_id,customer_id)
   values(tenant,org,customer) returning * into g;
   entity_type:='views_guest'; entity_id:=g.id; event_name:='views.guest.v1.created'; status_text:=g.status;
   response:=jsonb_build_object('guest_id',g.id,'customer_id',g.customer_id,'status',g.status);

 elsif kind='booking.create' then
   select * into u from public.vision_views_units where tenant_id=tenant and organization_id=org and id=(command->>'unit_id')::uuid and status='ACTIVE';
   select * into g from public.vision_views_guests where tenant_id=tenant and organization_id=org and id=(command->>'guest_id')::uuid and status='ACTIVE';
   if u.id is null or g.id is null then raise exception 'invalid_unit_or_guest' using errcode='22023'; end if;
   arrival_date:=(command->>'arrival')::date; departure_date:=(command->>'departure')::date;
   adults_count:=coalesce((command->>'adults')::integer,1); children_count:=coalesce((command->>'children')::integer,0);
   total_value:=case when command ? 'total_minor' and command->>'total_minor' is not null then (command->>'total_minor')::bigint else null end;
   if departure_date<=arrival_date or adults_count not between 1 and 50 or children_count not between 0 and 50
      or total_value<0 or coalesce(command->>'currency','USD') !~ '^[A-Z]{3}$' then
     raise exception 'invalid_booking' using errcode='22023';
   end if;
   insert into public.vision_views_bookings(tenant_id,organization_id,unit_id,guest_id,arrival,departure,adults,children,currency,total_minor,source,created_by)
   values(tenant,org,u.id,g.id,arrival_date,departure_date,adults_count,children_count,coalesce(command->>'currency','USD'),
          total_value,coalesce(nullif(btrim(command->>'source'),''),'DIRECT'),actor)
   returning * into b;
   insert into public.vision_views_booking_history(tenant_id,booking_id,from_status,to_status,actor_user_id)
   values(tenant,b.id,null,b.status,actor);
   entity_type:='views_booking'; entity_id:=b.id; correlation:=b.correlation_id; event_name:='views.booking.v1.created';
   status_text:=b.status; version_value:=b.version;
   response:=jsonb_build_object('booking_id',b.id,'status',b.status,'version',b.version,'correlation_id',b.correlation_id);

 elsif kind in ('booking.confirm','booking.cancel','stay.check_in','stay.check_out') then
   select * into b from public.vision_views_bookings
   where tenant_id=tenant and organization_id=org and id=(command->>'booking_id')::uuid for update;
   if b.id is null then raise exception 'forbidden' using errcode='42501'; end if;
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from b.version then raise exception 'version_conflict' using errcode='40001'; end if;
   old_status:=b.status;
   if kind='booking.confirm' and b.status='DRAFT' then
     perform pg_advisory_xact_lock(hashtextextended(tenant::text||b.unit_id::text,0));
     if exists(select 1 from public.vision_views_bookings x
       where x.tenant_id=tenant and x.unit_id=b.unit_id and x.id<>b.id and x.status in ('CONFIRMED','CHECKED_IN')
         and daterange(x.arrival,x.departure,'[)') && daterange(b.arrival,b.departure,'[)')) then
       raise exception 'booking_overlap' using errcode='23505';
     end if;
     b.status:='CONFIRMED'; event_name:='views.booking.v1.confirmed';
   elsif kind='booking.cancel' and b.status in ('DRAFT','CONFIRMED') then
     b.status:='CANCELLED'; event_name:='views.booking.v1.cancelled';
   elsif kind='stay.check_in' and b.status='CONFIRMED' then
     b.status:='CHECKED_IN'; event_name:='views.booking.v1.checked_in';
   elsif kind='stay.check_out' and b.status='CHECKED_IN' then
     b.status:='CHECKED_OUT'; event_name:='views.booking.v1.checked_out';
   else raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_views_bookings set status=b.status,version=version+1,updated_at=now() where id=b.id returning * into b;
   insert into public.vision_views_booking_history(tenant_id,booking_id,from_status,to_status,actor_user_id)
   values(tenant,b.id,old_status,b.status,actor);
   entity_type:='views_booking'; entity_id:=b.id; correlation:=b.correlation_id; status_text:=b.status; version_value:=b.version;
   response:=jsonb_build_object('booking_id',b.id,'status',b.status,'version',b.version,'correlation_id',b.correlation_id);

 elsif kind='maintenance.create' then
   select * into u from public.vision_views_units where tenant_id=tenant and organization_id=org and id=(command->>'unit_id')::uuid;
   if u.id is null or coalesce(length(btrim(command->>'title')),0) not between 1 and 240 then
     raise exception 'invalid_maintenance' using errcode='22023';
   end if;
   insert into public.vision_views_maintenance(tenant_id,organization_id,unit_id,title,category,priority,created_by)
   values(tenant,org,u.id,btrim(command->>'title'),coalesce(command->>'category','GENERAL'),coalesce(command->>'priority','NORMAL'),actor)
   returning * into m;
   entity_type:='views_maintenance'; entity_id:=m.id; correlation:=m.correlation_id; event_name:='views.maintenance.v1.created';
   status_text:=m.status; version_value:=m.version;
   response:=jsonb_build_object('maintenance_id',m.id,'status',m.status,'version',m.version,'correlation_id',m.correlation_id);

 elsif kind in ('maintenance.assign','maintenance.start','maintenance.complete') then
   select * into m from public.vision_views_maintenance
   where tenant_id=tenant and organization_id=org and id=(command->>'maintenance_id')::uuid for update;
   if m.id is null then raise exception 'forbidden' using errcode='42501'; end if;
   expected:=(command->>'expected_version')::bigint;
   if expected is distinct from m.version then raise exception 'version_conflict' using errcode='40001'; end if;
   old_status:=m.status;
   if kind='maintenance.assign' and m.status in ('OPEN','ASSIGNED') then
     assignee:=(command->>'assignee_user_id')::uuid;
     if not (
       vision_private.permitted_subject(tenant,org,'views.maintenance.assigned',assignee)
       or vision_private.permitted_subject(tenant,org,'views.maintenance.manage',assignee)
     ) then raise exception 'invalid_assignee' using errcode='42501'; end if;
     m.status:='ASSIGNED'; m.assigned_user_id:=assignee; event_name:='views.maintenance.v1.assigned';
   elsif kind='maintenance.start' and m.status='ASSIGNED' then
     m.status:='IN_PROGRESS'; event_name:='views.maintenance.v1.started';
   elsif kind='maintenance.complete' and m.status='IN_PROGRESS' then
     m.status:='COMPLETED'; event_name:='views.maintenance.v1.completed';
   else raise exception 'invalid_transition' using errcode='22023'; end if;
   update public.vision_views_maintenance
   set status=m.status,assigned_user_id=m.assigned_user_id,version=version+1,updated_at=now()
   where id=m.id returning * into m;
   entity_type:='views_maintenance'; entity_id:=m.id; correlation:=m.correlation_id; status_text:=m.status; version_value:=m.version;
   response:=jsonb_build_object('maintenance_id',m.id,'status',m.status,'version',m.version,'assignee_user_id',m.assigned_user_id,'correlation_id',m.correlation_id);
 end if;

 payload:=jsonb_build_object('event_id',event_id,'tenant_id',tenant,'organization_id',org,'entity_type',entity_type,
   'entity_id',entity_id,'correlation_id',correlation,'occurred_at',now(),'status',status_text,'version',version_value);
 insert into public.vision_audit_events(tenant_id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,correlation_id,payload)
 values(tenant,org,actor,event_name,entity_type,entity_id,request_id,correlation,payload);
 insert into public.vision_outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
 values(event_id,tenant,event_name,entity_type,entity_id,correlation,payload);
 insert into public.vision_views_command_receipts(tenant_id,actor_user_id,idempotency_key,command,response)
 values(tenant,actor,idem,command,response);
 return response;
end $$;

revoke all on function public.vision_views_command(jsonb) from public,anon;
grant execute on function public.vision_views_command(jsonb) to authenticated;

commit;
