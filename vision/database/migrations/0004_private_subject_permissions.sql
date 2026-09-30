begin;
-- Clients may inspect only their own permissions. Subject-specific checks are
-- needed by assignment, but must remain callable only from trusted functions.
alter function vision_private.permitted(uuid,uuid,text,uuid) rename to permitted_subject;
revoke all on function vision_private.permitted_subject(uuid,uuid,text,uuid) from public,anon,authenticated;
create function vision_private.permitted(t uuid,org uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select vision_private.permitted_subject(t,org,permission,vision_private.actor());
$$;
create function vision_private.permitted(t uuid,org uuid,permission text,who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select vision_private.permitted_subject(t,org,permission,who);
$$;
revoke all on function vision_private.permitted(uuid,uuid,text),vision_private.permitted(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function vision_private.permitted(uuid,uuid,text) to authenticated;
-- Rebind stored policy expressions to the caller-only function.
drop policy vision_task_read on public.vision_tasks;
create policy vision_task_read on public.vision_tasks for select to authenticated using(
 vision_private.permitted(tenant_id,organization_id,'cleaning.order.read')
 or vision_private.permitted(tenant_id,organization_id,'cleaning.quality.review')
 or (assigned_user_id=vision_private.actor() and vision_private.permitted(tenant_id,organization_id,'cleaning.task.read_assigned')));
drop policy vision_audit_read on public.vision_audit_events;
create policy vision_audit_read on public.vision_audit_events for select to authenticated using(vision_private.permitted(tenant_id,organization_id,'audit.read'));
commit;
