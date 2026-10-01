-- Verify delegated tenant/organization context before VISION forwards a user request to an external module.
-- This remains a VISION identity/RBAC concern; external modules keep their own business data and permissions.
begin;

create function public.vision_external_module_context_allowed(t uuid, org uuid, module_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.vision_memberships m
    join public.vision_users u
      on (u.tenant_id,u.id)=(m.tenant_id,m.user_id)
    join public.vision_organizations o
      on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
    where m.tenant_id=t
      and m.organization_id=org
      and m.user_id=vision_private.actor()
      and m.status='ACTIVE'
      and u.status='ACTIVE'
      and o.status='ACTIVE'
  )
  and exists(
    select 1
    from public.vision_module_definitions d
    where d.id=module_id
  );
$$;

revoke all on function public.vision_external_module_context_allowed(uuid,uuid,text) from public,anon;
grant execute on function public.vision_external_module_context_allowed(uuid,uuid,text) to authenticated;

commit;
