begin;
-- Return only the verified caller's active scope, never a caller-selected UUID.
create function public.vision_session() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'user_id',u.id,'tenant_id',u.tenant_id,'display_name',u.display_name,
  'memberships',coalesce((select jsonb_agg(jsonb_build_object('organization_id',o.id,'name',o.name,'permissions',
    (select coalesce(jsonb_agg(distinct p.code),'[]'::jsonb)
     from public.vision_membership_roles mr join public.vision_role_permissions rp on rp.role_id=mr.role_id
     join public.vision_permissions p on p.id=rp.permission_id
     where mr.tenant_id=m.tenant_id and mr.membership_id=m.id)))
    from public.vision_memberships m join public.vision_organizations o on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
    where m.tenant_id=u.tenant_id and m.user_id=u.id and m.status='ACTIVE' and o.status='ACTIVE'),'[]'::jsonb),
  'request_contexts',coalesce((select jsonb_agg(jsonb_build_object('customer_id',c.id,'customer_name',c.display_name,
    'requester_organization_id',o.id,'organization_name',o.name)) from public.vision_guest_links g
    join public.vision_customers c on (c.tenant_id,c.id)=(g.tenant_id,g.customer_id)
    join public.vision_organizations o on (o.tenant_id,o.id)=(g.tenant_id,g.requester_organization_id)
    where g.tenant_id=u.tenant_id and g.active and c.status='ACTIVE' and o.status='ACTIVE'
      and (g.user_id=u.id or vision_private.permitted(u.tenant_id,o.id,'views.order.create'))),'[]'::jsonb),
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name)) from public.vision_services s
    join public.vision_organizations o on (o.tenant_id,o.id)=(s.tenant_id,s.provider_organization_id)
    where s.tenant_id=u.tenant_id and s.status='ACTIVE' and o.status='ACTIVE' and s.code in ('cleaning.guest','cleaning.checkout')),'[]'::jsonb))
 from public.vision_users u where u.id=vision_private.actor() and u.status='ACTIVE';
$$;
revoke all on function public.vision_session() from public,anon;
grant execute on function public.vision_session() to authenticated;
commit;
