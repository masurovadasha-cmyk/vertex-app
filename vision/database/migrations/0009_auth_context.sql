-- VERTEX VISION Auth bootstrap 0.1
-- Additive staging-first contract: verified JWT subject -> tenant -> permitted Views organizations.
begin;

create function public.vision_auth_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 actor uuid:=vision_private.actor();
 tenant uuid;
 organizations jsonb:='[]'::jsonb;
begin
 if actor is null then
  raise exception 'forbidden' using errcode='42501';
 end if;

 select u.tenant_id into tenant
 from public.vision_users u
 where u.id=actor and u.status='ACTIVE';

 if tenant is null or not vision_private.active_actor(tenant) then
  raise exception 'forbidden' using errcode='42501';
 end if;

 select coalesce(jsonb_agg(to_jsonb(s) order by s.name,s.id),'[]'::jsonb)
 into organizations
 from (
   select
     o.id,
     o.code,
     o.name,
     o.kind,
     coalesce(
       jsonb_agg(distinct p.code order by p.code)
         filter (where p.code like 'views.%'),
       '[]'::jsonb
     ) as permissions
   from public.vision_memberships m
   join public.vision_organizations o
     on (o.tenant_id,o.id)=(m.tenant_id,m.organization_id)
   left join public.vision_membership_roles mr
     on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
   left join public.vision_role_permissions rp
     on rp.role_id=mr.role_id
   left join public.vision_permissions p
     on p.id=rp.permission_id
   where m.tenant_id=tenant
     and m.user_id=actor
     and m.status='ACTIVE'
     and o.status='ACTIVE'
   group by o.id,o.code,o.name,o.kind
   having count(*) filter (where p.code like 'views.%')>0
 ) s;

 return jsonb_build_object(
   'contract','vision-auth-context/v1',
   'user_id',actor,
   'tenant_id',tenant,
   'organizations',organizations
 );
end $$;

revoke all on function public.vision_auth_context() from public,anon;
grant execute on function public.vision_auth_context() to authenticated;

commit;
