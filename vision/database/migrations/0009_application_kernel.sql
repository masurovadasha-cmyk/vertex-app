-- VERTEX VISION Application Kernel 0.1
-- Server-authoritative session context. Browser-provided permissions are never trusted.
begin;

create function public.vision_session_context(p_tenant uuid,p_organization uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid:=vision_private.actor();
 permissions jsonb;
 roles jsonb;
 guest_linked boolean;
 module_enabled boolean;
begin
 if actor is null or p_tenant is null or p_organization is null
    or not vision_private.active_actor(p_tenant) then
   raise exception 'forbidden' using errcode='42501';
 end if;

 if not exists(
   select 1 from public.vision_organizations o
   where o.tenant_id=p_tenant and o.id=p_organization and o.status='ACTIVE'
 ) then raise exception 'forbidden' using errcode='42501'; end if;

 module_enabled:=vision_private.views_module_enabled(p_tenant,p_organization);
 if module_enabled is distinct from true then
   raise exception 'module_not_enabled' using errcode='42501';
 end if;

 select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into permissions
 from (
   select distinct p.code
   from public.vision_memberships m
   join public.vision_membership_roles mr
     on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
   join public.vision_roles r
     on (r.tenant_id,r.id)=(m.tenant_id,mr.role_id)
   join public.vision_role_permissions rp on rp.role_id=r.id
   join public.vision_permissions p on p.id=rp.permission_id
   where m.tenant_id=p_tenant and m.organization_id=p_organization
     and m.user_id=actor and m.status='ACTIVE'
 ) allowed;

 select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into roles
 from (
   select distinct r.code
   from public.vision_memberships m
   join public.vision_membership_roles mr
     on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
   join public.vision_roles r
     on (r.tenant_id,r.id)=(m.tenant_id,mr.role_id)
   where m.tenant_id=p_tenant and m.organization_id=p_organization
     and m.user_id=actor and m.status='ACTIVE'
 ) assigned;

 select exists(
   select 1 from public.vision_guest_links g
   where g.tenant_id=p_tenant and g.requester_organization_id=p_organization
     and g.user_id=actor and g.active
 ) into guest_linked;

 if jsonb_array_length(permissions)=0 and guest_linked is distinct from true then
   raise exception 'forbidden' using errcode='42501';
 end if;

 return jsonb_build_object(
   'actor_id',actor,
   'tenant_id',p_tenant,
   'organization_id',p_organization,
   'module','views',
   'module_enabled',true,
   'roles',roles,
   'permissions',permissions,
   'guest_linked',guest_linked,
   'capabilities',jsonb_build_object(
     'read_operations',permissions ? 'views.operations.read',
     'create_booking',permissions ? 'views.booking.create',
     'manage_booking',permissions ? 'views.booking.manage',
     'execute_cleaning',permissions ? 'views.cleaning.execute',
     'verify_cleaning',permissions ? 'views.cleaning.verify'
   )
 );
end $$;

revoke all on function public.vision_session_context(uuid,uuid) from public,anon;
grant execute on function public.vision_session_context(uuid,uuid) to authenticated;

commit;
