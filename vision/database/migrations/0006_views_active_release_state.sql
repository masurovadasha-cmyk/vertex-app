-- VERTEX VISION RC module release states.
-- Additive migration: do not edit already-applied 0005 in staging.
begin;

alter table public.vision_module_definitions
  add column if not exists release_state text not null default 'COMING_SOON'
    check (release_state in ('ACTIVE','COMING_SOON','DISABLED'));

alter table public.vision_module_definitions
  add column if not exists route text;

alter table public.vision_module_definitions
  add column if not exists sort_order integer not null default 100
    check (sort_order >= 0);

update public.vision_module_definitions
set release_state = case when id='views' then 'ACTIVE' else 'COMING_SOON' end,
    route = case when id='views' then '/vision/views' else '/vision/'||id end,
    sort_order = case id
      when 'views' then 10
      when 'managing' then 20
      when 'real-estate' then 30
      when 'engineers' then 40
      when 'aura-design' then 50
      when 'travel' then 60
      when 'aviation' then 70
      when 'rent-car' then 80
      when 'taxi' then 90
      when 'concierge' then 100
      when 'cleaning' then 110
      when 'laundry' then 120
      when 'ditalia' then 130
      when 'market' then 140
      when 'bar' then 150
      when 'technologies' then 160
      when 'investment' then 170
      when 'ventures' then 180
      when 'training' then 190
      else 1000 end;

-- Product release state is metadata only. Tenant installation state remains
-- separately controlled and defaults to REGISTERED; this migration grants no
-- client mutation capability and enables no cloud writes.
create unique index if not exists vision_single_active_release_module
  on public.vision_module_definitions ((release_state))
  where release_state='ACTIVE';

commit;
