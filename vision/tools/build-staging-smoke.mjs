// Owner-only SQL Editor smoke test. Uses synthetic JWT claims, NOT Auth tokens.
// All fixtures and commands roll back; never expose this through an API.
import {writeFile,mkdir} from 'node:fs/promises';
import {provisionDemo} from '../backend/demo.mjs';
const statements=[];
const literal=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
await provisionDemo({async query(sql,params=[]){
  if(!['begin','commit','rollback'].includes(sql))statements.push(sql.replace(/\$(\d+)/g,(_,n)=>literal(params[Number(n)-1]))+';');
  return {rows:[]};
}});
const sql=`begin;
select pg_advisory_xact_lock(1447646025,2);
do $$ begin
 if exists(select 1 from public.vision_tenants where id='00000000-0000-4000-8000-000000000001') then
  raise exception 'Smoke fixture IDs already in use; refusing to modify existing data';
 end if;
 if (select count(*) from vision_private.schema_migrations)<>5 then raise exception 'Expected five migrations'; end if;
end $$;
${statements.join('\n')}
do $$
declare c jsonb; r jsonb; initial jsonb; event public.vision_outbox_events; n integer;
begin
 execute 'set local role authenticated';
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010"}',true);
 c:='{"type":"create","tenant_id":"00000000-0000-4000-8000-000000000001","idempotency_key":"cloud-smoke-create","customer_id":"00000000-0000-4000-8000-000000000004","requester_organization_id":"00000000-0000-4000-8000-000000000002","service_id":"00000000-0000-4000-8000-000000000005"}';
 initial:=public.vision_command(c); r:=initial;
 if r->>'status'<>'NEW' or public.vision_command(c)<>r then raise exception 'Create/retry failed'; end if;
 begin
  perform public.vision_command(c||'{"service_id":"00000000-0000-4000-8000-000000009999"}');
  raise exception 'Changed payload accepted';
 exception when unique_violation then null; end;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009999"}',true);
 select count(*) into n from public.vision_orders;
 if n<>0 then raise exception 'Unprovisioned subject can read orders'; end if;
 begin perform public.vision_command(c); raise exception 'Unprovisioned subject can create'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011"}',true);
 select count(*) into n from public.vision_orders;
 if n<>1 then raise exception 'Views cannot see request'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013"}',true);
 select count(*) into n from public.vision_orders;
 if n<>0 then raise exception 'Unassigned staff can read order'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012"}',true);
 c:=jsonb_build_object('type','assign','tenant_id',c->>'tenant_id','idempotency_key','cloud-smoke-assign','order_id',r->>'order_id','expected_version',1,'assignee_user_id','00000000-0000-4000-8000-000000000013');
 r:=public.vision_command(c);
 begin perform public.vision_command(c||'{"idempotency_key":"cloud-smoke-stale"}'); raise exception 'Stale version accepted'; exception when serialization_failure then null; end;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013"}',true);
 c:=c-'assignee_user_id';
 r:=public.vision_command(c||jsonb_build_object('type','start','idempotency_key','cloud-smoke-start','expected_version',2));
 r:=public.vision_command(c||jsonb_build_object('type','submit','idempotency_key','cloud-smoke-submit','expected_version',3));
 begin perform public.vision_command(c||jsonb_build_object('type','pass','idempotency_key','cloud-smoke-self-review','expected_version',4)); raise exception 'Staff approved own work'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000014"}',true);
 r:=public.vision_command(c||jsonb_build_object('type','pass','idempotency_key','cloud-smoke-pass','expected_version',4));
 if r->>'status'<>'COMPLETED' or (r->>'version')::int<>5 or r->>'correlation_id'<>initial->>'correlation_id' then raise exception 'Final state mismatch'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000015"}',true);
 select count(*) into n from public.vision_audit_events where entity_id=(r->>'order_id')::uuid;
 if n<>5 then raise exception 'Audit count mismatch'; end if;
 begin perform 1 from public.vision_outbox_events; raise exception 'Client can read outbox'; exception when insufficient_privilege then null; end;
 begin update public.vision_orders set status='NEW'; raise exception 'Direct writes allowed'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 select count(*) into n from public.vision_outbox_events where aggregate_id=(r->>'order_id')::uuid;
 if n<>5 then raise exception 'Outbox count mismatch'; end if;
 if exists(select 1 from pg_class join pg_namespace ns on ns.oid=relnamespace where ns.nspname='public' and relname like 'vision\\_%' escape '\\' and relkind='r' and not relrowsecurity) then raise exception 'RLS missing'; end if;
end $$;
rollback;
select 'PASS: Golden Flow, RLS, retry, stale version, audit and outbox; fixtures rolled back. JWT verification not tested.' as result;
`;
await mkdir(new URL('../.build/',import.meta.url),{recursive:true});
await writeFile(new URL('../.build/staging-smoke.sql',import.meta.url),sql);
console.log('Prepared rollback-only staging smoke SQL');
