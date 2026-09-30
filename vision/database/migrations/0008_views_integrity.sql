-- Additive integrity migration. No legacy migration or existing identity is rewritten.
-- Daily inventory is an interim RC implementation for bounded, date-based accommodation.
-- This is not a timed-hold, rate-plan, OTA or multi-region inventory engine.
begin;

-- Cross-organization links are forbidden even within one tenant.
alter table public.vision_views_properties add constraint vision_views_property_org_key unique(tenant_id,organization_id,id);
alter table public.vision_views_units add constraint vision_views_unit_org_key unique(tenant_id,organization_id,id);
alter table public.vision_views_units add constraint vision_views_unit_property_org_fk
 foreign key(tenant_id,organization_id,property_id) references public.vision_views_properties(tenant_id,organization_id,id);
alter table public.vision_views_bookings add constraint vision_views_booking_unit_org_fk
 foreign key(tenant_id,organization_id,unit_id) references public.vision_views_units(tenant_id,organization_id,id);
alter table public.vision_views_bookings add constraint vision_views_booking_inventory_key unique(tenant_id,organization_id,unit_id,id);
alter table public.vision_views_cleaning_jobs add constraint vision_views_cleaning_booking_scope_fk
 foreign key(tenant_id,organization_id,unit_id,booking_id) references public.vision_views_bookings(tenant_id,organization_id,unit_id,id);
alter table public.vision_views_bookings add constraint vision_views_finite_bounded_stay
 check(isfinite(check_in) and isfinite(check_out) and check_out-check_in between 1 and 3660);
alter table public.vision_views_bookings add constraint vision_views_finite_money
 check(total::text not in ('NaN','Infinity','-Infinity') and amount_paid::text not in ('NaN','Infinity','-Infinity'));

create table public.vision_views_inventory_nights(
 tenant_id uuid not null,
 organization_id uuid not null,
 unit_id uuid not null,
 stay_date date not null,
 booking_id uuid not null,
 primary key(tenant_id,unit_id,stay_date),
 foreign key(tenant_id,organization_id,unit_id,booking_id)
  references public.vision_views_bookings(tenant_id,organization_id,unit_id,id) on delete cascade,
 check(isfinite(stay_date))
);
create index vision_views_inventory_booking on public.vision_views_inventory_nights(tenant_id,booking_id);
alter table public.vision_views_inventory_nights enable row level security;
revoke all on public.vision_views_inventory_nights from public,anon,authenticated;
grant select on public.vision_views_inventory_nights to authenticated;
create policy vision_views_inventory_read on public.vision_views_inventory_nights for select to authenticated
 using(vision_private.permitted(tenant_id,organization_id,'views.operations.read'));

-- Backfill under the locks already acquired above. Existing collisions fail the entire
-- migration, rather than choosing a winning guest, truncating history or deleting data.
insert into public.vision_views_inventory_nights(tenant_id,organization_id,unit_id,stay_date,booking_id)
 select b.tenant_id,b.organization_id,b.unit_id,b.check_in+n,b.id
 from public.vision_views_bookings b
 cross join lateral generate_series(0,b.check_out-b.check_in-1) as n
 where b.status in ('CONFIRMED','CHECKED_IN');

create function vision_private.sync_views_inventory() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if (OLD.tenant_id,OLD.organization_id,OLD.unit_id,OLD.check_in,OLD.check_out,
       OLD.status in ('CONFIRMED','CHECKED_IN')) is not distinct from
      (NEW.tenant_id,NEW.organization_id,NEW.unit_id,NEW.check_in,NEW.check_out,
       NEW.status in ('CONFIRMED','CHECKED_IN')) then return NEW; end if;
   delete from public.vision_views_inventory_nights where tenant_id=OLD.tenant_id and booking_id=OLD.id;
 end if;
 if NEW.status in ('CONFIRMED','CHECKED_IN') then
   insert into public.vision_views_inventory_nights(tenant_id,organization_id,unit_id,stay_date,booking_id)
    select NEW.tenant_id,NEW.organization_id,NEW.unit_id,NEW.check_in+n,NEW.id
    from generate_series(0,NEW.check_out-NEW.check_in-1) as n;
 end if;
 return NEW;
end $$;
revoke all on function vision_private.sync_views_inventory() from public,anon,authenticated;
create trigger vision_views_inventory_sync after insert or update of
 tenant_id,organization_id,unit_id,check_in,check_out,status on public.vision_views_bookings
 for each row execute function vision_private.sync_views_inventory();

alter table public.vision_views_cleaning_jobs add column started_by uuid;
alter table public.vision_views_cleaning_jobs add column submitted_by uuid;
alter table public.vision_views_cleaning_jobs add constraint vision_views_cleaner_started_fk
 foreign key(tenant_id,started_by) references public.vision_users(tenant_id,id);
alter table public.vision_views_cleaning_jobs add constraint vision_views_cleaner_submitted_fk
 foreign key(tenant_id,submitted_by) references public.vision_users(tenant_id,id);

-- Actor provenance comes only from the verified transaction context. Caller-supplied
-- provenance must not be accepted. Historical jobs with unknown submitter cannot be
-- silently verified; they need explicit, audited reconciliation before rollout.
create function vision_private.guard_views_cleaning_quality() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=vision_private.actor(); current_unit_status text;
begin
 if (NEW.started_by,NEW.submitted_by) is distinct from (OLD.started_by,OLD.submitted_by) then
   raise exception 'cleaning_provenance_immutable' using errcode='42501';
 end if;
 if NEW.status=OLD.status then return NEW; end if;
 if actor is null or not vision_private.active_actor(NEW.tenant_id) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if OLD.status='REQUIRED' and NEW.status='IN_PROGRESS' then
   NEW.started_by:=actor;
 elsif OLD.status='IN_PROGRESS' and NEW.status='INSPECTION' then
   if OLD.started_by is distinct from actor then
     raise exception 'cleaning_not_executor' using errcode='42501';
   end if;
   NEW.submitted_by:=actor;
 elsif OLD.status='INSPECTION' and NEW.status='VERIFIED' then
   if OLD.submitted_by is null or actor=OLD.submitted_by or actor=OLD.started_by then
     raise exception 'independent_quality_required' using errcode='42501';
   end if;
   -- Lock before the legacy command can set READY; a newer maintenance/block state
   -- must never be overwritten by an old cleaning job.
   select status into current_unit_status from public.vision_views_units
    where tenant_id=NEW.tenant_id and id=NEW.unit_id for update;
   if current_unit_status is distinct from 'CLEANING' then
     raise exception 'unit_not_in_cleaning' using errcode='22023';
   end if;
 end if;
 return NEW;
end $$;
revoke all on function vision_private.guard_views_cleaning_quality() from public,anon,authenticated;
create trigger vision_views_cleaning_quality before update on public.vision_views_cleaning_jobs
 for each row execute function vision_private.guard_views_cleaning_quality();

-- Product readiness and organization installation are enforced at SQL, not just Hub.
create function vision_private.views_module_enabled(tenant uuid, org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select vision_private.active_actor(tenant) and exists(
  select 1 from public.vision_module_installations i
  join public.vision_module_definitions d on d.id=i.module_id
  where i.tenant_id=tenant and i.organization_id=org and i.module_id='views'
    and i.state='ENABLED' and d.release_state='ACTIVE'
 );
$$;
revoke all on function vision_private.views_module_enabled(uuid,uuid) from public,anon,authenticated;
grant execute on function vision_private.views_module_enabled(uuid,uuid) to authenticated;

-- Retain the reviewed v1 state machine behind an inaccessible compatibility facade.
alter function public.vision_views_command(jsonb) set schema vision_private;
revoke all on function vision_private.vision_views_command(jsonb) from public,anon,authenticated;
create function public.vision_views_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid; org uuid; kind text; permission text;
begin
 if jsonb_typeof(command) is distinct from 'object' then
   raise exception 'invalid_command' using errcode='22023';
 end if;
 tenant:=(command->>'tenant_id')::uuid; kind:=command->>'type';
 if tenant is null or not vision_private.active_actor(tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if kind='create_booking' then
   org:=(command->>'organization_id')::uuid; permission:='views.booking.create';
 elsif kind in ('confirm_booking','check_in','check_out','cancel_booking') then
   select organization_id into org from public.vision_views_bookings
    where tenant_id=tenant and id=(command->>'booking_id')::uuid;
   permission:='views.booking.manage';
 elsif kind in ('cleaning_start','cleaning_submit','cleaning_verify') then
   select organization_id into org from public.vision_views_cleaning_jobs
    where tenant_id=tenant and id=(command->>'cleaning_job_id')::uuid;
   permission:=case when kind='cleaning_verify' then 'views.cleaning.verify' else 'views.cleaning.execute' end;
 else raise exception 'invalid_command' using errcode='22023';
 end if;
 if org is null or not vision_private.permitted(tenant,org,permission) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if not vision_private.views_module_enabled(tenant,org) then
   raise exception 'module_not_enabled' using errcode='42501';
 end if;
 return vision_private.vision_views_command(command);
end $$;
revoke all on function public.vision_views_command(jsonb) from public,anon,authenticated;
grant execute on function public.vision_views_command(jsonb) to authenticated;

create or replace function vision_private.read_views_booking(bid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vision_views_bookings b where b.id=bid
  and vision_private.views_module_enabled(b.tenant_id,b.organization_id)
  and (vision_private.guest_owns(b.tenant_id,b.customer_id,b.organization_id)
       or vision_private.permitted(b.tenant_id,b.organization_id,'views.operations.read')));
$$;
alter policy vision_views_property_read on public.vision_views_properties
 using(vision_private.views_module_enabled(tenant_id,organization_id) and vision_private.permitted(tenant_id,organization_id,'views.operations.read'));
alter policy vision_views_unit_read on public.vision_views_units
 using(vision_private.views_module_enabled(tenant_id,organization_id) and vision_private.permitted(tenant_id,organization_id,'views.operations.read'));
alter policy vision_views_cleaning_read on public.vision_views_cleaning_jobs
 using(vision_private.views_module_enabled(tenant_id,organization_id) and (
   vision_private.permitted(tenant_id,organization_id,'views.operations.read')
   or vision_private.permitted(tenant_id,organization_id,'views.cleaning.execute')
   or vision_private.permitted(tenant_id,organization_id,'views.cleaning.verify')));
alter policy vision_views_inventory_read on public.vision_views_inventory_nights
 using(vision_private.views_module_enabled(tenant_id,organization_id) and vision_private.permitted(tenant_id,organization_id,'views.operations.read'));

commit;
