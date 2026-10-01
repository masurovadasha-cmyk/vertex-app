-- VERTEX VISION Views RC 0.1 authenticated UI context.
begin;

create function public.vision_views_context()
returns table(
  user_id uuid,
  tenant_id uuid,
  organization_id uuid,
  organization_name text,
  can_unit_manage boolean,
  can_guest_manage boolean,
  can_booking_manage boolean,
  can_stay_manage boolean,
  can_maintenance_manage boolean,
  can_finance_read boolean
)
language sql stable security definer set search_path='' as $$
  select
    m.user_id,
    m.tenant_id,
    m.organization_id,
    o.name,
    vision_private.permitted(m.tenant_id,m.organization_id,'views.unit.manage'),
    vision_private.permitted(m.tenant_id,m.organization_id,'views.guest.manage'),
    vision_private.permitted(m.tenant_id,m.organization_id,'views.booking.manage'),
    vision_private.permitted(m.tenant_id,m.organization_id,'views.stay.manage'),
    vision_private.permitted(m.tenant_id,m.organization_id,'views.maintenance.manage'),
    vision_private.permitted(m.tenant_id,m.organization_id,'views.finance.read')
  from public.vision_memberships m
  join public.vision_users u on (u.tenant_id,u.id)=(m.tenant_id,m.user_id)
  join public.vision_organizations o on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
  where m.user_id=vision_private.actor()
    and m.status='ACTIVE'
    and u.status='ACTIVE'
    and o.status='ACTIVE'
    and (
      vision_private.permitted(m.tenant_id,m.organization_id,'views.unit.read')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.unit.manage')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.guest.read')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.guest.manage')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.booking.read')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.booking.manage')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.stay.manage')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.maintenance.read')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.maintenance.manage')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.maintenance.assigned')
      or vision_private.permitted(m.tenant_id,m.organization_id,'views.finance.read')
    )
  order by o.name,m.organization_id;
$$;

revoke all on function public.vision_views_context() from public,anon;
grant execute on function public.vision_views_context() to authenticated;

commit;
