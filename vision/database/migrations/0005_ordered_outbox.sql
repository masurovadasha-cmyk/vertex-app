begin;

-- One domain event is emitted per order version. Ordering uses the version,
-- never transaction timestamps or random UUIDs, which can invert transitions.
alter table public.vision_outbox_events
 add column aggregate_version bigint generated always as ((payload->>'version')::bigint) stored,
 add column next_attempt_at timestamptz not null default now(),
 add column quarantined_at timestamptz,
 add column failure_code text check(failure_code in ('transient','permanent','exhausted'));
alter table public.vision_outbox_events alter column aggregate_version set not null;
alter table public.vision_outbox_events add check(aggregate_version>0);
create unique index vision_outbox_aggregate_version on public.vision_outbox_events
 (tenant_id,aggregate_type,aggregate_id,aggregate_version);
create index vision_outbox_ordered_pending on public.vision_outbox_events
 (tenant_id,aggregate_type,aggregate_id,aggregate_version) where published_at is null;

create or replace function public.vision_outbox_claim(batch_size integer default 25)
returns setof public.vision_outbox_events
language plpgsql security definer set search_path='' as $$
begin
 if batch_size is null or batch_size not between 1 and 100 then
   raise exception 'invalid_batch_size' using errcode='22023';
 end if;
 -- A worker can crash without a negative acknowledgment. Expired final leases
 -- still consume the attempt budget; quarantine them without waiting on peers.
 with exhausted as (
   select id from public.vision_outbox_events
   where published_at is null and quarantined_at is null and attempts>=8
     and (lease_until is null or lease_until<=clock_timestamp())
   order by created_at,id for update skip locked limit 100
 ) update public.vision_outbox_events e
   set quarantined_at=clock_timestamp(),failure_code='exhausted',lease_token=null,lease_until=null
   from exhausted x where e.id=x.id;
 return query
 with pending as (
   select e.id from public.vision_outbox_events e
   where e.published_at is null and e.quarantined_at is null and e.attempts<8
     and e.next_attempt_at<=clock_timestamp()
     and (e.lease_until is null or e.lease_until<=clock_timestamp())
     and not exists (
       select 1 from public.vision_outbox_events predecessor
       where predecessor.tenant_id=e.tenant_id
         and predecessor.aggregate_type=e.aggregate_type
         and predecessor.aggregate_id=e.aggregate_id
         and predecessor.aggregate_version<e.aggregate_version
         and predecessor.published_at is null
     )
   order by e.next_attempt_at,e.created_at,e.id for update of e skip locked limit batch_size
 ) update public.vision_outbox_events e
   set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=e.attempts+1
   from pending p where e.id=p.id returning e.*;
end $$;

create or replace function public.vision_outbox_ack(event uuid,token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.vision_outbox_events
 set published_at=clock_timestamp(),lease_until=null,lease_token=null,failure_code=null
 where id=event and lease_token=token and lease_until>clock_timestamp()
   and published_at is null and quarantined_at is null;
 return found;
end $$;

create function public.vision_outbox_nack(event uuid,token uuid,failure text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if failure is null or failure not in ('transient','permanent') then
   raise exception 'invalid_failure_code' using errcode='22023';
 end if;
 update public.vision_outbox_events
 set lease_token=null,lease_until=null,
   next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts-1,6)))::integer),
   quarantined_at=case when failure='permanent' or attempts>=8 then clock_timestamp() else null end,
   failure_code=case when attempts>=8 then 'exhausted' else failure end
 where id=event and lease_token=token and lease_until>clock_timestamp()
   and published_at is null and quarantined_at is null;
 return found;
end $$;
revoke all on function public.vision_outbox_claim(integer),public.vision_outbox_ack(uuid,uuid),
 public.vision_outbox_nack(uuid,uuid,text) from public,anon,authenticated;
commit;
