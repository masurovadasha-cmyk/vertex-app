import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateSupabaseStaging,signInSynthetic} from './auth.mjs';

const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):null;
const releaseFile=candidateRoot?path.join(candidateRoot,'vision/release/0.1-RC1.json'):new URL('../release/0.1-RC1.json',import.meta.url);
const release=JSON.parse(fs.readFileSync(releaseFile,'utf8'));
const required=name=>{
  const value=process.env[name];
  if(!value)throw new Error('missing_staging_secret:'+name);
  return value;
};
const stagingURL=required('VISION_STAGING_URL');
const worker=new URL(stagingURL);
if(worker.protocol!=='https:'||worker.hostname!=='vertex-vision-staging.masurovadasha.workers.dev'||worker.pathname!=='/'||worker.search||worker.hash)throw new Error('invalid_staging_worker_url');
const config=validateSupabaseStaging(process.env);
const provision=JSON.parse(fs.readFileSync(process.argv[2]||'artifacts/staging/provision.json','utf8'));
if(provision.syntheticOnly!==true||provision.projectRef!==config.projectRef)throw new Error('invalid_provision_report');

const credentials={};
for(const key of ['guest','views','staff','quality']){
  credentials[key]=await signInSynthetic({
    url:config.url,key:config.key,
    email:required('VISION_E2E_'+key.toUpperCase()+'_EMAIL'),
    password:required('VISION_E2E_'+key.toUpperCase()+'_PASSWORD')
  });
}

async function parse(response,limit=1048576){
  const text=await response.text();
  if(new TextEncoder().encode(text).length>limit)throw new Error('e2e_response_too_large');
  try{return JSON.parse(text);}catch{throw new Error('e2e_invalid_json');}
}
async function workerJSON(pathname,{session,method='GET',body}={}){
  const headers={};
  if(session)headers.authorization='Bearer '+session.token;
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(new URL(pathname,worker),{
    method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  const data=await parse(response);
  const requestId=response.headers.get('x-request-id');
  if(!/^[0-9a-f-]{36}$/i.test(requestId||''))throw new Error('missing_request_id');
  return {response,data,requestId,correlationId:response.headers.get('x-correlation-id')};
}
async function command(session,payload,expected=200){
  const result=await workerJSON('/api/v1/views/commands',{session,method:'POST',body:payload});
  if(result.response.status!==expected)throw new Error('unexpected_command_status:'+payload.type+':'+result.response.status);
  if(expected===200){
    if(result.correlationId!==result.data.correlation_id)throw new Error('correlation_header_mismatch');
  }else if(result.correlationId!==null)throw new Error('failed_command_has_correlation');
  return result;
}
async function context(session){
  const q=new URLSearchParams({tenant_id:provision.tenantId,organization_id:provision.organizationId});
  const result=await workerJSON('/api/v1/context?'+q,{session});
  if(result.response.status!==200)throw new Error('context_failed:'+result.response.status);
  return result.data;
}
async function directBookings(session){
  const q=new URLSearchParams({
    tenant_id:'eq.'+provision.tenantId,
    organization_id:'eq.'+provision.organizationId,
    id:'eq.'+booking.booking_id,
    select:'id,customer_id,status'
  });
  const response=await fetch(config.url+'/rest/v1/vision_views_bookings?'+q,{
    headers:{apikey:config.key,authorization:'Bearer '+session.token},
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('direct_rls_read_failed:'+response.status);
  const body=await parse(response);
  if(!Array.isArray(body))throw new Error('direct_rls_invalid_response');
  return body;
}

const readiness=await workerJSON('/readyz');
if(readiness.response.status!==200||readiness.data.ready!==true||readiness.data.latestMigration!==release.databaseMigration||readiness.data.architectureVersion!==release.architectureVersion)throw new Error('staging_not_ready');

const managerContext=await context(credentials.views);
const cleanerContext=await context(credentials.staff);
const qualityContext=await context(credentials.quality);
const guestContext=await context(credentials.guest);
if(!managerContext.permissions.includes('views.booking.manage')||!managerContext.permissions.includes('views.booking.create')||managerContext.permissions.includes('views.cleaning.execute')||managerContext.permissions.includes('views.cleaning.verify'))throw new Error('manager_context_invalid');
if(!cleanerContext.permissions.includes('views.cleaning.execute')||cleanerContext.permissions.includes('views.cleaning.verify'))throw new Error('cleaner_context_invalid');
if(!qualityContext.permissions.includes('views.cleaning.verify')||qualityContext.permissions.includes('views.cleaning.execute'))throw new Error('quality_context_invalid');
if(guestContext.guestLinked!==true||guestContext.permissions.length!==0)throw new Error('guest_context_invalid');

const day=86400000,offset=parseInt(randomUUID().replaceAll('-','').slice(0,8),16)%2000;
const start=new Date(Date.UTC(2030,0,1)+offset*day);
const finish=new Date(start.getTime()+2*day);
const isoDate=d=>d.toISOString().slice(0,10);
const checkIn=isoDate(start),checkOut=isoDate(finish);
const base=type=>({type,tenant_id:provision.tenantId,idempotency_key:randomUUID()});

const create={
  ...base('create_booking'),
  organization_id:provision.organizationId,
  unit_id:provision.unitId,
  customer_id:provision.customerId,
  check_in:checkIn,check_out:checkOut,source:'e2e',total:'321.00',currency:'USD'
};
await command(credentials.guest,create,403);

let created=await command(credentials.views,create);
let booking=created.data;
const replay=await command(credentials.views,create);
if(JSON.stringify(replay.data)!==JSON.stringify(booking))throw new Error('create_idempotency_failed');

booking=(await command(credentials.views,{...base('confirm_booking'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
const conflictCandidate=await command(credentials.views,{...create,idempotency_key:randomUUID()});
const conflictResult=await command(credentials.views,{...base('confirm_booking'),booking_id:conflictCandidate.data.booking_id,expected_version:conflictCandidate.data.booking_version},409);
if(conflictResult.data.error!=='conflict')throw new Error('overlap_not_rejected');

const stale=await command(credentials.views,{...base('check_in'),booking_id:booking.booking_id,expected_version:booking.booking_version-1},409);
if(stale.data.error!=='conflict')throw new Error('stale_version_not_rejected');

booking=(await command(credentials.views,{...base('check_in'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
booking=(await command(credentials.views,{...base('check_out'),booking_id:booking.booking_id,expected_version:booking.booking_version})).data;
if(booking.booking_status!=='CHECKED_OUT'||booking.cleaning_status!=='REQUIRED')throw new Error('checkout_state_invalid');

booking=(await command(credentials.staff,{...base('cleaning_start'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
booking=(await command(credentials.staff,{...base('cleaning_submit'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
await command(credentials.staff,{...base('cleaning_verify'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version},403);
booking=(await command(credentials.quality,{...base('cleaning_verify'),cleaning_job_id:booking.cleaning_job_id,expected_version:booking.cleaning_version})).data;
if(booking.booking_status!=='COMPLETED'||booking.cleaning_status!=='VERIFIED')throw new Error('final_state_invalid');

const q=new URLSearchParams({tenant_id:provision.tenantId,organization_id:provision.organizationId,limit:'100'});
const listed=await workerJSON('/api/v1/views/bookings?'+q,{session:credentials.views});
if(listed.response.status!==200||!listed.data.some(row=>row.id===booking.booking_id&&row.status==='COMPLETED'))throw new Error('completed_booking_not_visible');

const guestRows=await directBookings(credentials.guest);
if(guestRows.length!==1||guestRows[0].id!==booking.booking_id)throw new Error('guest_rls_did_not_return_own_booking');
const cleanerRows=await directBookings(credentials.staff);
if(cleanerRows.length!==0)throw new Error('cleaner_rls_leaked_booking');

const report={
  status:'passed',
  syntheticOnly:true,
  stagingURL:worker.origin,
  sourceCommit:process.env.GITHUB_SHA||null,
  architectureVersion:readiness.data.architectureVersion,
  latestMigration:readiness.data.latestMigration,
  tenantId:provision.tenantId,
  organizationId:provision.organizationId,
  unitId:provision.unitId,
  bookingId:booking.booking_id,
  correlationId:booking.correlation_id,
  roles:{
    manager:'server-authoritative',
    cleaner:'separate-identity',
    quality:'separate-identity',
    guest:'linked-customer'
  },
  checks:[
    'runtime-readiness',
    'server-context',
    'guest-create-denied',
    'idempotent-create',
    'overlap-conflict',
    'stale-version-conflict',
    'check-in',
    'check-out',
    'separate-cleaner-execute',
    'cleaner-verify-denied',
    'separate-quality-verify',
    'final-completed-ready',
    'guest-direct-rls',
    'cleaner-direct-rls-deny',
    'request-correlation-trace'
  ],
  productionChanged:false
};
const output=process.argv[3]||'artifacts/staging/cloud-e2e.json';
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
