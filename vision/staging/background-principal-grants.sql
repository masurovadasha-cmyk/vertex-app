-- VERTEX VISION staging background principal grant contract.
-- The login role itself is provisioned out-of-band with a generated password.
-- This file never creates a password and must never be applied to production by CI.
begin;

do $grant_contract$
begin
  if not exists(select 1 from pg_roles where rolname='vision_background_staging') then
    raise exception 'vision_background_staging role must be provisioned out-of-band';
  end if;
end
$grant_contract$;

revoke all on all tables in schema public from vision_background_staging;
revoke all on all sequences in schema public from vision_background_staging;
revoke all on all functions in schema public from vision_background_staging;

grant usage on schema public to vision_background_staging;

grant execute on function public.vision_outbox_claim(integer) to vision_background_staging;
grant execute on function public.vision_outbox_ack(uuid,uuid) to vision_background_staging;
grant execute on function public.vision_outbox_fail(uuid,uuid) to vision_background_staging;
grant execute on function public.vision_notification_consume(uuid,uuid,text,text,uuid,uuid,text,jsonb) to vision_background_staging;
grant execute on function public.vision_background_scopes(integer) to vision_background_staging;
grant execute on function public.vision_reconcile_escalations(uuid,uuid) to vision_background_staging;

commit;
