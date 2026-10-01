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
       and md.module_key='views'
       and mi.status='ENABLED'
   )
 order by o.tenant_id,o.id
 limit greatest(1,least(coalesce(p_limit,100),500));
$vision_background_scopes$;

revoke all on function public.vision_background_scopes(integer) from public,anon,authenticated;
-- Operator may grant EXECUTE only to the dedicated background scheduler principal.

commit;
