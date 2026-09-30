import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const out=new URL('../../.vision-build/auth-staging-evidence/',import.meta.url);await mkdir(out,{recursive:true});
const names=['VISION_STAGING_URL','VISION_TEST_MANAGER_EMAIL','VISION_TEST_MANAGER_PASSWORD','VISION_TEST_CLEANER_EMAIL','VISION_TEST_CLEANER_PASSWORD','VISION_TEST_QUALITY_EMAIL','VISION_TEST_QUALITY_PASSWORD','VISION_TEST_CUSTOMER_ID'];
const missing=names.filter(name=>!process.env[name]);
const report={status:'running',verified:false,checked_at:new Date().toISOString(),missing};
const save=()=>writeFile(new URL('cloud-auth.json',out),JSON.stringify(report,null,2));
if(missing.length){report.status='skipped';report.reason='cloud-auth-not-configured';await save();console.log('SKIP genuine Supabase staging Auth: '+missing.join(', '));process.exit(0);}
const base=process.env.VISION_STAGING_URL.replace(/\/+$/,'');
if(!/^https:\/\//.test(base))throw new Error('VISION_STAGING_URL must use HTTPS');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function request(path,{method='GET',token,body}={}){
 const response=await fetch(base+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=response.status===204?null:await response.json();
 if(!response.ok)throw new Error((data?.error||'request_failed')+':'+response.status);
 return data;
}
async function signIn(email,password){const value=await request('/api/v1/auth/sign-in',{method:'POST',body:{email,password}});if(!UUID.test(value?.user?.id||''))throw new Error('invalid_auth_session');return value;}
async function context(session){const value=await request('/api/v1/auth/context',{token:session.access_token});if(value?.contract!=='vision-auth-context/v1')throw new Error('invalid_auth_context');return value;}
function organization(ctx,permission){const value=ctx.organizations.find(org=>org.permissions.includes(permission));if(!value)throw new Error('missing_permission:'+permission);return value;}
async function snapshot(session,ctx,org){const params=new URLSearchParams({tenant_id:ctx.tenant_id,organization_id:org.id,from:'2099-01-01',to:'2099-01-31'});return request('/api/v1/views/operations?'+params,{token:session.access_token});}
async function command(session,ctx,org,type,fields={}){return request('/api/v1/views/commands',{method:'POST',token:session.access_token,body:{type,tenant_id:ctx.tenant_id,organization_id:org.id,idempotency_key:randomUUID(),...fields}});}
const sessions=[];
try{
 const manager=await signIn(process.env.VISION_TEST_MANAGER_EMAIL,process.env.VISION_TEST_MANAGER_PASSWORD);sessions.push(manager);
 const managerContext=await context(manager),managerOrg=organization(managerContext,'views.booking.manage');
 if(!managerOrg.permissions.includes('views.booking.create')||!managerOrg.permissions.includes('views.operations.read'))throw new Error('manager_permissions_incomplete');
 let snap=await snapshot(manager,managerContext,managerOrg);const unit=snap.units.items.find(item=>item.status==='READY')||snap.units.items[0];if(!unit)throw new Error('no_test_unit');
 const customer=process.env.VISION_TEST_CUSTOMER_ID;if(!UUID.test(customer))throw new Error('invalid_test_customer_id');
 let booking=await command(manager,managerContext,managerOrg,'create_booking',{unit_id:unit.id,customer_id:customer,check_in:'2099-01-10',check_out:'2099-01-12',total:'0',currency:'USD',source:'direct'});
 booking=await command(manager,managerContext,managerOrg,'confirm_booking',{booking_id:booking.booking_id,expected_version:booking.booking_version});
 booking=await command(manager,managerContext,managerOrg,'check_in',{booking_id:booking.booking_id,expected_version:booking.booking_version});
 booking=await command(manager,managerContext,managerOrg,'check_out',{booking_id:booking.booking_id,expected_version:booking.booking_version});
 const cleaner=await signIn(process.env.VISION_TEST_CLEANER_EMAIL,process.env.VISION_TEST_CLEANER_PASSWORD);sessions.push(cleaner);
 const cleanerContext=await context(cleaner),cleanerOrg=organization(cleanerContext,'views.cleaning.execute');let cleaning=await snapshot(cleaner,cleanerContext,cleanerOrg);
 let job=cleaning.cleaning.items.find(item=>item.booking_id===booking.booking_id);if(!job)throw new Error('cleaning_job_missing');
 let changed=await command(cleaner,cleanerContext,cleanerOrg,'cleaning_start',{cleaning_job_id:job.id,expected_version:job.version});
 changed=await command(cleaner,cleanerContext,cleanerOrg,'cleaning_submit',{cleaning_job_id:job.id,expected_version:changed.cleaning_version});
 const quality=await signIn(process.env.VISION_TEST_QUALITY_EMAIL,process.env.VISION_TEST_QUALITY_PASSWORD);sessions.push(quality);
 const qualityContext=await context(quality),qualityOrg=organization(qualityContext,'views.cleaning.verify');cleaning=await snapshot(quality,qualityContext,qualityOrg);job=cleaning.cleaning.items.find(item=>item.id===job.id);if(!job||job.status!=='INSPECTION')throw new Error('inspection_missing');
 await command(quality,qualityContext,qualityOrg,'cleaning_verify',{cleaning_job_id:job.id,expected_version:job.version});
 snap=await snapshot(manager,managerContext,managerOrg);const finalBooking=snap.bookings.items.find(item=>item.id===booking.booking_id),finalUnit=snap.units.items.find(item=>item.id===unit.id);
 if(finalBooking?.status!=='COMPLETED'||finalUnit?.status!=='READY')throw new Error('final_state_mismatch');
 report.status='passed';report.verified=true;report.tenant_id=managerContext.tenant_id;report.organization_id=managerOrg.id;report.booking_id=booking.booking_id;report.worker=base;await save();
 console.log('PASS genuine Supabase/Cloudflare staging Auth and Views vertical flow');
}catch(error){report.status='failed';report.error=String(error.message||error).slice(0,300);await save();throw error;}
finally{for(const session of sessions)try{await request('/api/v1/auth/sign-out',{method:'POST',token:session.access_token});}catch{}}
