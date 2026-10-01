import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../../vision/backend/migrate.mjs';
import {provisionDemo,demo} from '../../vision/backend/demo.mjs';
import {handle} from '../../vision/backend/worker.mjs';

const required=name=>{
  const value=process.env[name];
  if(!value)throw new Error('missing_local_supabase:'+name);
  return value;
};
const apiURL=required('LOCAL_SUPABASE_API_URL').replace(/\/$/,'');
const anonKey=required('LOCAL_SUPABASE_ANON_KEY');
const serviceKey=required('LOCAL_SUPABASE_SERVICE_KEY');
const databaseURL=required('LOCAL_SUPABASE_DB_URL');
const fakeRef='localintegrationtst1';
const fakeURL=`https://${fakeRef}.supabase.co`;
const fakeKey='sb_publishable_local_integration_test';
const workerEnv={
  VISION_ENV:'staging',
  SUPABASE_STAGING_REF:fakeRef,
  SUPABASE_URL:fakeURL,
  SUPABASE_PUBLISHABLE_KEY:fakeKey,
  VISION_SOURCE_COMMIT:process.env.VISION_CANDIDATE_SHA||process.env.GITHUB_SHA||''
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function parse(response,limit=1048576){
  const text=await response.text();
  if(new TextEncoder().encode(text).length>limit)throw new Error('local_e2e_response_too_large');
  try{return JSON.parse(text);}catch{throw new Error('local_e2e_invalid_json:'+response.status);}
}
async function localFetcher(input,options={}){
  const source=new URL(typeof input==='string'?input:input.url);
  if(source.origin!==fakeURL)return fetch(input,options);
  const target=new URL(source.pathname+source.search,apiURL);
  const headers=new Headers(options.headers||{});
  if(headers.get('apikey')===fakeKey)headers.set('apikey',anonKey);
  return fetch(target,{...options,headers});
}
async function createUser(key){
  const run=(process.env.GITHUB_RUN_ID||Date.now().toString()).replace(/[^0-9]/g,'').slice(-12)||'local';
  const email=`vision-${key}-${run}-${randomUUID().slice(0,8)}@example.test`;
  const password=`V!sion-Local-${randomUUID()}-2026`;
  const response=await fetch(apiURL+'/auth/v1/admin/users',{
    method:'POST',
    headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'content-type':'application/json'},
    body:JSON.stringify({email,password,email_confirm:true}),
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  const body=await parse(response);
  if(!response.ok)throw new Error('local_auth_admin_create_failed:'+key+':'+response.status);
  const userId=body?.id||body?.user?.id;
  if(!uuid.test(userId||''))throw new Error('local_auth_admin_invalid_user:'+key);
  return {email,password,userId};
}
async function signIn(identity){
  const response=await fetch(apiURL+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:anonKey,'content-type':'application/json'},
    body:JSON.stringify({email:identity.email,password:identity.password}),
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  const body=await parse(response);
  if(!response.ok)throw new Error('local_auth_signin_failed:'+response.status);
  if(!uuid.test(body?.user?.id||'')||body.user.id!==identity.userId||typeof body.access_token!=='string'||body.access_token.length<20)throw new Error('local_auth_signin_invalid');
  return {userId:body.user.id,token:body.access_token};
}

const identities={};
const credentials={};
for(const key of ['guest','views','dispatcher','staff','quality','audit']){
  identities[key]=await createUser(key);
  credentials[key]=await signIn(identities[key]);
}
if(new Set(Object.values(identities).map(x=>x.userId)).size!==6)throw new Error('local_auth_users_not_distinct');

const client=new pg.Client({connectionString:databaseURL,application_name:'vertex-vision-local-supabase-e2e'});
await client.connect();
const db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
let e2eUnitId;
try{
  await client.query("set statement_timeout='60s'");
  await migrate(db);
  await provisionDemo(db,Object.fromEntries(Object.entries(identities).map(([k,v])=>[k,v.userId])));
  e2eUnitId=randomUUID();
  await client.query(
    'insert into public.vision_views_units(id,tenant_id,organization_id,property_id,unit_number,unit_type,status) values($1,$2,$3,$4,$5,$6,$7)',
    [e2eUnitId,demo.tenant_id,demo.views_id,demo.property_id,'LOCAL-E2E-'+randomUUID().slice(0,8),'synthetic-e2e','READY']
  );
  await client.query("select pg_notify('pgrst','reload schema')");
  await new Promise(resolve=>setTimeout(resolve,1500));
  const readiness=(await client.query('select public.vision_runtime_readiness() result')).rows[0]?.result;
  if(!readiness?.ready||!readiness?.rls_ok||!readiness?.functions_ok||!readiness?.tables_ok)throw new Error('local_database_not_ready');
}finally{await client.end();}

async function workerJSON(pathname,{session,method='GET',body}={}){
  const headers={};
  if(session)headers.authorization='Bearer '+session.token;
  if(body!==undefined)headers['content-type']='application/json';
  const request=new Request('https://vision.local'+pathname,{
    method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const response=await handle(request,workerEnv,localFetcher);
  const data=await parse(response);
  const requestId=response.headers.get('x-request-id');
  if(!/^[0-9a-f-]{36}$/i.test(requestId||''))throw new Error('local_missing_request_id');
  return {response,data,requestId,correlationId:response.headers.get('x-correlation-id')};
}
async function command(session,payload,expected=200){
  const result=await workerJSON('/api/v1/views/commands',{session,method:'POST',body:payload});
  if(result.response.status!==expected)throw new Error('local_unexpected_command_status:'+payload.type+':'+result.response.status+':'+JSON.stringify(result.data));
  return result;
}
async function context(session){
  const q=new URLSearchParams({tenant_id:demo.tenant_id,organization_id:demo.views_id});
  const result=await workerJSON('/api/v1/context?'+q,{session});
  if(result.response.status!==200)throw new Error('local_context_failed:'+result.response.status);
  return result.data;
}
async function scopes(session){
  const result=await workerJSON('/api/v1/session-scopes',{session});
  if(result.response.status!==200)throw new Error('local_scopes_failed:'+result.response.status);
  return result.data;
}

const health=await workerJSON('/health');
if(health.response.status!==200||health.data.service!=='VERTEX VISION'||health.data.environment!=='staging'||health.data.configured!==true)throw new Error('local_health_invalid');
const ready=await workerJSON('/readyz');
if(ready.response.status!==200||ready.data.ready!==true||ready.data.rlsOk!==true)throw new Error('local_readyz_invalid:'+JSON.stringify(ready.data));
const authConfig=await workerJSON('/auth-config');
if(authConfig.response.status!==200||authConfig.data.provider!=='supabase'||authConfig.data.persistence!=='memory-only')throw new Error('local_auth_config_invalid');
if(Object.hasOwn(authConfig.data,'authority')&&authConfig.data.authority!=='server-derived')throw new Error('local_auth_authority_invalid');
if(Object.hasOwn(authConfig.data,'privilegedRoleSelection')&&authConfig.data.privilegedRoleSelection!==false)throw new Error('local_auth_privilege_selection_invalid');

const managerScopes=await scopes(credentials.views);
const staffScopes=await scopes(credentials.staff);
const qualityScopes=await scopes(credentials.quality);
const guestScopes=await scopes(credentials.guest);
for(const [name,value] of [['manager',managerScopes],['staff',staffScopes],['quality',qualityScopes],['guest',guestScopes]]){
  if(value.module!=='views'||value.scopes.length!==1||value.scopes[0].tenantId!==demo.tenant_id||value.scopes[0].organizationId!==demo.views_id)throw new Error('local_'+name+'_scope_invalid');
}
if(managerScopes.scopes[0].memberAuthorized!==true||guestScopes.scopes[0].guestLinked!==true)throw new Error('local_scope_authority_invalid');

const managerContext=await context(credentials.views);
const staffContext=await context(credentials.staff);
const qualityContext=await context(credentials.quality);
const guestContext=await context(credentials.guest);
if(!managerContext.permissions.includes('views.booking.manage')||!managerContext.permissions.includes('views.booking.create'))throw new Error('local_manager_context_invalid');
if(!staffContext.permissions.includes('views.cleaning.execute')||staffContext.permissions.includes('views.cleaning.verify'))throw new Error('local_staff_context_invalid');
if(!qualityContext.permissions.includes('views.cleaning.verify')||qualityContext.permissions.includes('views.cleaning.execute'))throw new Error('local_quality_context_invalid');
if(guestContext.guestLinked!==true||guestContext.permissions.length!==0)throw new Error('local_guest_context_invalid');

const day=86400000,offset=parseInt(randomUUID().replaceAll('-','').slice(0,8),16)%2000;
const start=new Date(Date.UTC(2032,0,1)+offset*day),finish=new Date(start.getTime()+2*day);
const iso=d=>d.toISOString().slice(0,10);
const base=type=>({type,tenant_id:demo.tenant_id,idempotency_key:randomUUID()});
const create={
  ...base('create_booking'),organization_id:demo.views_id,unit_id:e2eUnitId,customer_id:demo.customer_id,
  check_in:iso(start),check_out:iso(finish),source:'local-supabase-e2e',total:'321.00',currency:'USD'
};
await command(credentials.guest,create,403);
let booking=(await command(credentials.views,create)).data;
const replay=(await command(credentials.views,create)).data;
if(JSON.stringify(replay)!==JSON.stringify(booking))throw new Error('local_create_idempotency_failed');
booking=(await command(credentials.views,{...base('confirm_booking'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
const stale=await command(credentials.views,{...base('check_in'),booking_id:booking.booking_id,expected_version:booking.booking_version-1},409);
if(stale.data.error!=='conflict')throw new Error('local_stale_version_not_rejected');
booking=(await command(credentials.views,{...base('check_in'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
booking=(await command(credentials.views,{...base('check_out'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
if(booking.booking_status!=='CHECKED_OUT'||booking.cleaning_status!=='REQUIRED')throw new Error('local_checkout_invalid');
booking=(await command(credentials.staff,{...base('cleaning_start'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
booking=(await command(credentials.staff,{...base('cleaning_submit'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
await command(credentials.staff,{...base('cleaning_verify'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version},403);
booking=(await command(credentials.quality,{...base('cleaning_verify'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
if(booking.booking_status!=='COMPLETED'||booking.cleaning_status!=='VERIFIED')throw new Error('local_final_state_invalid');

const directQuery=new URLSearchParams({
  tenant_id:'eq.'+demo.tenant_id,organization_id:'eq.'+demo.views_id,id:'eq.'+booking.booking_id,select:'id,customer_id,status'
});
async function directRows(session){
  const response=await fetch(apiURL+'/rest/v1/vision_views_bookings?'+directQuery,{
    headers:{apikey:anonKey,authorization:'Bearer '+session.token},
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('local_direct_rls_failed:'+response.status);
  const body=await parse(response);if(!Array.isArray(body))throw new Error('local_direct_rls_invalid');
  return body;
}
const guestRows=await directRows(credentials.guest);
const staffRows=await directRows(credentials.staff);
if(guestRows.length!==1||guestRows[0].id!==booking.booking_id)throw new Error('local_guest_rls_failed');
if(staffRows.length!==0)throw new Error('local_staff_rls_leak');

const report={
  status:'passed',
  syntheticOnly:true,
  backend:'local-supabase',
  sourceCommit:process.env.VISION_CANDIDATE_SHA||process.env.GITHUB_SHA||null,
  tenantId:demo.tenant_id,
  organizationId:demo.views_id,
  unitId:e2eUnitId,
  bookingId:booking.booking_id,
  correlationId:booking.correlation_id,
  checks:[
    'supabase-auth-admin-create','password-sign-in','database-migrations','runtime-readiness',
    'worker-health','worker-readyz','public-auth-config','server-session-scopes','server-context',
    'guest-create-denied','idempotent-create','stale-version-conflict','check-in','check-out',
    'separate-cleaner-execute','cleaner-verify-denied','separate-quality-verify',
    'final-completed-ready','guest-direct-rls','staff-direct-rls-deny'
  ],
  productionChanged:false
};
const output=process.argv[2]||'artifacts/local-supabase/e2e.json';
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
