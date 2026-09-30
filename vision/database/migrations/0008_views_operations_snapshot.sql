-- Read-only Views UI contract. Additive; never replace an applied migration.
begin;
create function public.vision_views_operations_snapshot(
 p_tenant_id uuid, p_organization_id uuid, p_from date, p_to date
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 permissions jsonb; modules jsonb; units jsonb:='[]'; bookings jsonb:='[]'; cleaning jsonb:='[]';
 unit_count bigint:=0; booking_count bigint:=0; cleaning_count bigint:=0;
 unit_states jsonb:='{}'; can_read boolean; can_clean boolean;
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>31 then
  raise exception 'invalid_date_range' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(code),'[]'::jsonb) into permissions from unnest(array[
  'views.operations.read','views.booking.create','views.booking.manage',
  'views.cleaning.execute','views.cleaning.verify'
 ]) as codes(code) where vision_private.permitted(p_tenant_id,p_organization_id,code);
 if not vision_private.active_actor(p_tenant_id) or jsonb_array_length(permissions)=0 then
  raise exception 'forbidden' using errcode='42501';
 end if;
 can_read:=permissions ? 'views.operations.read';
 can_clean:=can_read or permissions ? 'views.cleaning.execute' or permissions ? 'views.cleaning.verify';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',release_state,
  'route',route) order by sort_order,id),'[]') into modules from public.vision_module_definitions;
 if can_read then
  select count(*) into unit_count from public.vision_views_units
   where tenant_id=p_tenant_id and organization_id=p_organization_id;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into units from (
   select id,property_id,unit_number,status,version from public.vision_views_units
    where tenant_id=p_tenant_id and organization_id=p_organization_id order by unit_number,id limit 200
  ) s;
  select coalesce(jsonb_object_agg(status,n),'{}') into unit_states from (
   select status,count(*) n from public.vision_views_units
    where tenant_id=p_tenant_id and organization_id=p_organization_id group by status
  ) s;
  select count(*) into booking_count from public.vision_views_bookings
   where tenant_id=p_tenant_id and organization_id=p_organization_id and check_in<p_to and check_out>p_from;
  -- Do not expose customer identity or financial columns through the operations snapshot.
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into bookings from (
   select id,unit_id,public_no,check_in,check_out,status,version from public.vision_views_bookings
    where tenant_id=p_tenant_id and organization_id=p_organization_id and check_in<p_to and check_out>p_from
    order by check_in,id limit 200
  ) s;
 end if;
 if can_clean then
  select count(*) into cleaning_count from public.vision_views_cleaning_jobs
   where tenant_id=p_tenant_id and organization_id=p_organization_id and status<>'VERIFIED';
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into cleaning from (
   select id,unit_id,booking_id,status,version from public.vision_views_cleaning_jobs
    where tenant_id=p_tenant_id and organization_id=p_organization_id and status<>'VERIFIED'
    order by created_at,id limit 200
  ) s;
 end if;
 return jsonb_build_object(
  'contract','views-operations-ui/v1','tenant_id',p_tenant_id,'organization_id',p_organization_id,
  'from',p_from,'to',p_to,'generated_at',now(),'permissions',permissions,'modules',modules,
  'units',jsonb_build_object('available',can_read,'items',units,'total',unit_count,'limit',200,'truncated',unit_count>200),
  'bookings',jsonb_build_object('available',can_read,'items',bookings,'total',booking_count,'limit',200,'truncated',booking_count>200),
  'cleaning',jsonb_build_object('available',can_clean,'items',cleaning,'total',cleaning_count,'limit',200,'truncated',cleaning_count>200),
  'unit_status_counts',unit_states
 );
end $$;
revoke all on function public.vision_views_operations_snapshot(uuid,uuid,date,date) from public,anon;
grant execute on function public.vision_views_operations_snapshot(uuid,uuid,date,date) to authenticated;
commit;
